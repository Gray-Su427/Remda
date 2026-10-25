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

export interface CatalogModel {
  id: string
  name: string
}

export interface ModelCatalogSnapshot {
  /** 最近一次成功拿到新数据的时间（ms）；null 表示还没联网更新过 */
  updatedAt: number | null
  /** 最近一次成功检查的时间（含 304）；用于判断是否需要再次刷新 */
  checkedAt: number | null
  /** key 为 Remda 的服务商 id，例如 deepseek / openai */
  providers: Record<string, CatalogModel[]>
  /** 最近一次刷新失败的原因，仅内存态，不写缓存 */
  lastError?: string
}

export interface BootstrapInfo {
  /** 仅 E2E 使用：启动时自动打开的文档 */
  e2eDoc?: string
}
