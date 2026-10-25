export type FileNode =
  | { kind: 'dir'; name: string; path: string; children: FileNode[] }
  | { kind: 'file'; name: string; path: string; size: number }

export interface DocumentPayload {
  path: string
  name: string
  content: string
  mtimeMs: number
  size: number
}

export interface FileChangeEvent {
  type: 'change' | 'unlink'
  path: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  quote?: { text: string; anchor?: string }
  error?: string
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface SettingsInput {
  baseUrl: string
  model: string
  temperature: number
  maxContextChars: number
  theme: ThemeMode
  apiKey: string
}

export type PublicSettings = Omit<SettingsInput, 'apiKey'> & {
  hasApiKey: boolean
  apiKeyHint: string
}

export interface ConnectionCheck {
  ok: boolean
  error?: string
}

export interface BootstrapInfo {
  /** 仅 E2E 使用：启动时自动打开的文档 */
  e2eDoc?: string
}
