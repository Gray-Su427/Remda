import { AppError, toAppError } from '@shared/errors'
import { IPC, type ChatEvent, type ChatRequest, type LlmMessage } from '@shared/ipc'
import { isLoopbackBaseUrl } from '@shared/providers'
import type {
  BootstrapInfo,
  FileChangeEvent,
  ModelCatalogSnapshot,
  SettingsInput
} from '@shared/types'
import { readDocument, readTree, watchDocument } from '../services/fsService'
import type { ConversationStore } from '../services/conversationStore'
import type { SettingsStore } from '../services/settingsStore'
import { streamChat, testConnection } from '../llm/openaiClient'

export interface HandlerDeps {
  pickFolder(): Promise<string | null>
  pickFile(): Promise<string | null>
  settings: SettingsStore
  conversations: ConversationStore
  catalog: {
    get(): Promise<ModelCatalogSnapshot>
    refresh(): Promise<ModelCatalogSnapshot>
  }
  emitChat(event: ChatEvent): void
  emitFile(event: FileChangeEvent): void
  openExternal(url: string): Promise<void>
  bootstrap(): Promise<BootstrapInfo>
  streamChatImpl?: (input: {
    baseUrl: string
    apiKey: string
    model: string
    messages: LlmMessage[]
    temperature: number
    signal: AbortSignal
    sessionId?: string
  }) => AsyncGenerator<string>
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void
  on(channel: string, listener: (event: unknown, ...args: never[]) => void): void
}

type Handler = (...args: unknown[]) => unknown

export function createHandlers(deps: HandlerDeps): Record<string, Handler> {
  const watchers = new Map<string, () => void>()
  const active = new Map<string, AbortController>()

  const handlers: Record<string, Handler> = {
    [IPC.fsPickFolder]: async () => deps.pickFolder(),
    [IPC.fsPickFile]: async () => deps.pickFile(),
    [IPC.fsReadTree]: (async (root: string) => readTree(root)) as Handler,
    [IPC.fsReadDocument]: (async (path: string) => readDocument(path)) as Handler,
    [IPC.fsWatch]: (async (path: string) => {
      watchers.get(path)?.()
      watchers.set(
        path,
        watchDocument(path, (event: FileChangeEvent) => deps.emitFile(event))
      )
    }) as Handler,
    [IPC.fsUnwatch]: (async (path: string) => {
      watchers.get(path)?.()
      watchers.delete(path)
    }) as Handler,
    [IPC.settingsGet]: async () => deps.settings.getPublic(),
    [IPC.settingsSave]: (async (patch: Partial<SettingsInput>) => {
      const saved = await deps.settings.save(patch)
      if (patch.theme) {
        // renderer 自行应用主题；main 不需要额外持久化
      }
      return saved
    }) as Handler,
    [IPC.settingsTest]: (async (input: {
      baseUrl: string
      apiKey?: string
      model: string
      modelsUrl?: string
    }) => {
      const apiKey = input.apiKey?.trim() || (await deps.settings.resolveApiKey(input.baseUrl))
      return testConnection({
        baseUrl: input.baseUrl,
        apiKey,
        model: input.model,
        modelsUrl: input.modelsUrl
      })
    }) as Handler,
    [IPC.catalogGet]: async () => deps.catalog.get(),
    [IPC.catalogRefresh]: async () => deps.catalog.refresh(),
    [IPC.chatStart]: (async (request: ChatRequest) => {
      const { requestId, messages } = request
      const controller = new AbortController()
      active.set(requestId, controller)
      const settings = await deps.settings.load()
      const run = deps.streamChatImpl ?? streamChat

      // 事件流式推送；本 handler 在整段生成结束后才 resolve，
      // 这样渲染端 await 即可知道本轮结束，同时不影响中途 abort。
      try {
        if (!settings.apiKey && !isLoopbackBaseUrl(settings.baseUrl)) {
          throw new AppError('LLM_NO_KEY', '还没有配置 API Key，请到设置里填写')
        }
        for await (const text of run({
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
          messages,
          temperature: settings.temperature,
          signal: controller.signal,
          sessionId: requestId
        })) {
          deps.emitChat({ type: 'delta', requestId, text })
        }
        deps.emitChat({ type: 'done', requestId })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          deps.emitChat({ type: 'done', requestId })
        } else {
          deps.emitChat({
            type: 'error',
            requestId,
            message: error instanceof Error ? error.message : String(error)
          })
        }
      } finally {
        active.delete(requestId)
      }
    }) as Handler,
    [IPC.convLoad]: (async (docPath: string) => deps.conversations.load(docPath)) as Handler,
    [IPC.convSave]: (async (docPath: string, messages: Parameters<ConversationStore['save']>[1]) =>
      deps.conversations.save(docPath, messages)) as Handler,
    [IPC.convClear]: (async (docPath: string) => deps.conversations.clear(docPath)) as Handler,
    [IPC.shellOpenExternal]: (async (url: string) => {
      if (!/^https?:\/\//i.test(url)) {
        throw new AppError('SHELL_BLOCKED', '只允许打开 http/https 链接')
      }
      await deps.openExternal(url)
    }) as Handler,
    [IPC.appBootstrap]: (async () => deps.bootstrap()) as Handler
  }

  const abort = (requestId: string): void => {
    active.get(requestId)?.abort()
  }

  Object.defineProperty(handlers, '__abort', { value: abort, enumerable: false })
  return handlers
}

export function registerIpc(ipc: IpcMainLike, handlers: Record<string, Handler>): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipc.handle(channel, (_event, ...args) => {
      const result = handler(...args)
      return result instanceof Promise
        ? result.catch((error: unknown) => {
            throw toIpcError(error)
          })
        : result
    })
  }
  const abort = (handlers as unknown as { __abort?: (id: string) => void }).__abort
  ipc.on(IPC.chatAbort, ((_event: unknown, requestId: string) => {
    abort?.(requestId)
  }) as never)
}

/**
 * Electron 只能序列化 Error 的 message，抛裸对象会让渲染端只看到 "[object Object]"。
 * 这里保证一定抛 Error 实例，且 message 为可直接展示的中文。
 */
function toIpcError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(toAppError(error).message)
}
