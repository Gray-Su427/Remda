import type { ChatEvent, ChatRequest, LlmMessage } from './ipc'
import type {
  BootstrapInfo,
  ChatMessage,
  ConnectionCheck,
  DocumentPayload,
  FileChangeEvent,
  FileNode,
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
    test(input: { baseUrl: string; apiKey?: string; model: string }): Promise<ConnectionCheck>
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
