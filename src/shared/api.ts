import type { ChatEvent, ChatRequest, LlmMessage } from './ipc'
import type {
  BootstrapInfo,
  ChatMessage,
  ConnectionCheck,
  DocumentPayload,
  FileChangeEvent,
  FileNode,
  LlmProtocol,
  ModelCatalogSnapshot,
  PublicSettings,
  SettingsInput
} from './types'

export interface RemdaApi {
  fs: {
    pickFolder(): Promise<string | null>
    pickFile(): Promise<string | null>
    readTree(root: string): Promise<FileNode>
    readDocument(path: string): Promise<DocumentPayload>
    watch(path: string): Promise<void>
    unwatch(path: string): Promise<void>
    onChanged(cb: (event: FileChangeEvent) => void): () => void
  }
  settings: {
    get(): Promise<PublicSettings>
    save(patch: Partial<SettingsInput>): Promise<PublicSettings>
    test(input: {
      baseUrl: string
      apiKey?: string
      model: string
      protocol?: LlmProtocol
      apiBase?: string
      modelsUrl?: string
    }): Promise<ConnectionCheck>
  }
  catalog: {
    /** 读取本地缓存（可能为空），不会发起网络请求 */
    get(): Promise<ModelCatalogSnapshot>
    /** 联网刷新模型目录；失败时返回旧快照并带 lastError */
    refresh(): Promise<ModelCatalogSnapshot>
  }
  chat: {
    start(request: ChatRequest): Promise<void>
    abort(requestId: string): Promise<void>
    onEvent(cb: (event: ChatEvent) => void): () => void
  }
  conversations: {
    load(docPath: string): Promise<ChatMessage[]>
    save(docPath: string, messages: ChatMessage[]): Promise<void>
    clear(docPath: string): Promise<void>
  }
  shell: {
    openExternal(url: string): Promise<void>
  }
  app: {
    getBootstrap(): Promise<BootstrapInfo>
  }
}

export type { LlmMessage }
