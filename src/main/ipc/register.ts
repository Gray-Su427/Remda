import { AppError, toAppError } from '@shared/errors'
import { IPC, type ChatEvent, type ChatRequest, type LlmMessage } from '@shared/ipc'
import { isLoopbackBaseUrl } from '@shared/providers'
import type {
  BootstrapInfo,
  FileChangeEvent,
  LlmProtocol,
  ModelCatalogSnapshot,
  SettingsInput,
  ThinkingMode,
  WorkspaceRetrieveRequest,
  WorkspaceRetrieveResult
} from '@shared/types'
import { readDocument, readTree, watchDocument } from '../services/fsService'
import type { ConversationStore } from '../services/conversationStore'
import type { SettingsStore } from '../services/settingsStore'
import {
  buildPlannerPrompt,
  parseRetrievalPlan,
  PLANNER_SYSTEM_PROMPT,
  type RetrievalPlan
} from '../services/chatPlanner'
import type {
  WorkspaceCatalogResult,
  WorkspaceExcerptResult,
  WorkspaceReadOptions,
  WorkspaceSelection
} from '../services/workspaceIndex'
import { streamChat, testConnection } from '../llm/client'

export interface HandlerDeps {
  pickFolder(defaultPath?: string): Promise<string | null>
  pickFile(defaultPath?: string): Promise<string | null>
  settings: SettingsStore
  conversations: ConversationStore
  catalog: {
    get(): Promise<ModelCatalogSnapshot>
    refresh(): Promise<ModelCatalogSnapshot>
  }
  workspace: {
    search(input: WorkspaceRetrieveRequest): Promise<WorkspaceRetrieveResult>
    catalog(root: string, maxChars?: number): Promise<WorkspaceCatalogResult>
    readSelections(
      root: string,
      selections: WorkspaceSelection[],
      options: WorkspaceReadOptions
    ): Promise<WorkspaceExcerptResult>
    relativeDocPath(root: string, docPath?: string): Promise<string | undefined>
  }
  /** 本地图片协议：登记允许读取的目录 */
  images: {
    allowRoot(dir: string): Promise<void>
    allowDocument(file: string): Promise<void>
  }
  emitChat(event: ChatEvent): void
  emitFile(event: FileChangeEvent): void
  openExternal(url: string): Promise<void>
  bootstrap(): Promise<BootstrapInfo>
  streamChatImpl?: (input: {
    baseUrl: string
    apiBase?: string
    protocol: LlmProtocol
    apiKey: string
    model: string
    messages: LlmMessage[]
    temperature: number
    thinking?: ThinkingMode
    signal: AbortSignal
    sessionId?: string
    onNotice?: (message: string) => void
  }) => AsyncGenerator<string>
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void
  on(channel: string, listener: (event: unknown, ...args: never[]) => void): void
}

type Handler = (...args: unknown[]) => unknown
type ChatStream = typeof streamChat

function insertWorkspaceBlock(messages: LlmMessage[], block: string): LlmMessage[] {
  const last = messages.at(-1)
  if (last?.role === 'user') {
    return [...messages.slice(0, -1), { role: 'user', content: block }, last]
  }
  return [...messages, { role: 'user', content: block }]
}

export function createHandlers(deps: HandlerDeps): Record<string, Handler> {
  const watchers = new Map<string, () => void>()
  const active = new Map<string, AbortController>()

  /**
   * AI 检索：先让模型从目录里选文件，再读取选中小节；任何一步失败都回退本地检索。
   */
  const prepareWorkspaceMessages = async (
    request: ChatRequest,
    requestId: string,
    settings: SettingsInput,
    run: ChatStream,
    signal: AbortSignal
  ): Promise<LlmMessage[]> => {
    const workspace = request.workspace
    if (!workspace?.root || !workspace.question.trim()) return request.messages
    deps.emitChat({ type: 'phase', requestId, phase: 'planning' })

    let plan: RetrievalPlan | null = null
    try {
      const catalog = await deps.workspace.catalog(workspace.root, 12000)
      const currentPath = await deps.workspace.relativeDocPath(workspace.root, workspace.docPath)
      const plannerMessages: LlmMessage[] = [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildPlannerPrompt({
            workspaceName: workspace.root.split(/[\\/]/).filter(Boolean).pop() ?? '工作区',
            catalog: catalog.text,
            catalogTruncated: catalog.truncated,
            question: workspace.question,
            selection: workspace.selection,
            currentPath
          })
        }
      ]
      let raw = ''
      const plannerSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)])
      for await (const text of run({
        baseUrl: settings.baseUrl,
        apiBase: settings.apiBase,
        protocol: settings.protocol,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: plannerMessages,
        temperature: Math.min(settings.temperature, 0.2),
        thinking: 'off',
        signal: plannerSignal,
        sessionId: requestId
      })) {
        raw += text
        if (raw.length > 20000) break
      }
      if (signal.aborted) return request.messages
      plan = parseRetrievalPlan(raw, catalog.paths)
    } catch {
      if (signal.aborted) return request.messages
    }

    if (plan && (plan.files.length > 0 || plan.keywords.length > 0)) {
      deps.emitChat({ type: 'phase', requestId, phase: 'reading' })
      try {
        const excerpts = await deps.workspace.readSelections(workspace.root, plan.files, {
          budget: workspace.budget,
          currentDocPath: workspace.docPath,
          keywords: plan.keywords
        })
        if (excerpts.block) {
          deps.emitChat({ type: 'sources', requestId, sources: excerpts.sources })
          return insertWorkspaceBlock(request.messages, excerpts.block)
        }
      } catch {
        if (signal.aborted) return request.messages
      }
    }

    deps.emitChat({
      type: 'notice',
      requestId,
      message: plan ? 'AI 没有选中可读取的文件，已使用本地检索' : 'AI 选文件失败，已使用本地检索'
    })
    try {
      const local = await deps.workspace.search({
        root: workspace.root,
        docPath: workspace.docPath,
        question: workspace.question,
        selection: workspace.selection,
        budget: workspace.budget
      })
      if (local.block) {
        deps.emitChat({ type: 'sources', requestId, sources: local.sources })
        return insertWorkspaceBlock(request.messages, local.block)
      }
    } catch {
      // 本地检索也失败时继续用当前文档回答。
    }
    return request.messages
  }


  const handlers: Record<string, Handler> = {
    [IPC.fsPickFolder]: (async (defaultPath?: unknown) =>
      deps.pickFolder(typeof defaultPath === 'string' && defaultPath ? defaultPath : undefined)) as Handler,
    [IPC.fsPickFile]: (async (defaultPath?: unknown) =>
      deps.pickFile(typeof defaultPath === 'string' && defaultPath ? defaultPath : undefined)) as Handler,
    [IPC.fsReadTree]: (async (root: string) => {
      await deps.images.allowRoot(root)
      return readTree(root)
    }) as Handler,
    [IPC.fsReadDocument]: (async (path: string) => {
      await deps.images.allowDocument(path)
      return readDocument(path)
    }) as Handler,
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
      protocol?: LlmProtocol
      apiBase?: string
      modelsUrl?: string
    }) => {
      const apiKey = input.apiKey?.trim() || (await deps.settings.resolveApiKey(input.baseUrl))
      return testConnection({
        baseUrl: input.baseUrl,
        apiKey,
        model: input.model,
        protocol: input.protocol,
        apiBase: input.apiBase,
        modelsUrl: input.modelsUrl
      })
    }) as Handler,
    [IPC.catalogGet]: async () => deps.catalog.get(),
    [IPC.catalogRefresh]: async () => deps.catalog.refresh(),
    [IPC.workspaceRetrieve]: (async (input: WorkspaceRetrieveRequest) => {
      const root = typeof input?.root === 'string' ? input.root.trim() : ''
      const question = typeof input?.question === 'string' ? input.question.trim() : ''
      if (!root) throw new AppError('WORKSPACE_NOT_OPEN', '请先打开一个文件夹')
      if (!question) throw new AppError('WORKSPACE_EMPTY_QUESTION', '问题不能为空')
      const budget = Number.isFinite(input.budget)
        ? Math.min(Math.max(Math.floor(input.budget), 1000), 200000)
        : 6000
      return deps.workspace.search({ ...input, root, question, budget })
    }) as Handler,
    [IPC.chatStart]: (async (request: ChatRequest) => {
      const { requestId } = request
      const controller = new AbortController()
      active.set(requestId, controller)
      const settings = await deps.settings.load()
      const run = deps.streamChatImpl ?? streamChat
      let messages = request.messages

      // 事件流式推送；本 handler 在整段生成结束后才 resolve，
      // 这样渲染端 await 即可知道本轮结束，同时不影响中途 abort。
      try {
        if (!settings.apiKey && !isLoopbackBaseUrl(settings.baseUrl)) {
          throw new AppError('LLM_NO_KEY', '还没有配置 API Key，请到设置里填写')
        }
        if (request.workspace?.root && request.workspace.question.trim()) {
          messages = await prepareWorkspaceMessages(
            request,
            requestId,
            settings,
            run as ChatStream,
            controller.signal
          )
          if (controller.signal.aborted) {
            deps.emitChat({ type: 'done', requestId })
            return
          }
          deps.emitChat({ type: 'phase', requestId, phase: 'answering' })
        }
        for await (const text of run({
          baseUrl: settings.baseUrl,
          apiBase: settings.apiBase,
          protocol: settings.protocol,
          apiKey: settings.apiKey,
          model: settings.model,
          messages,
          temperature: settings.temperature,
          thinking: settings.thinkingMode,
          signal: controller.signal,
          sessionId: requestId,
          onNotice: (message) => deps.emitChat({ type: 'notice', requestId, message })
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
