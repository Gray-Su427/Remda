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

export const THINKING_MODES = ['off', 'auto', 'deep'] as const

/** 思考档位：关闭 / 跟随模型默认 / 显式加强 */
export type ThinkingMode = (typeof THINKING_MODES)[number]

export const isThinkingMode = (value: unknown): value is ThinkingMode =>
  typeof value === 'string' && (THINKING_MODES as readonly string[]).includes(value)

export interface SettingsInput {
  baseUrl: string
  /** 该模型使用的上游协议 */
  protocol: LlmProtocol
  /** 模型级请求基址；空表示沿用 baseUrl */
  apiBase: string
  model: string
  temperature: number
  maxContextChars: number
  /** 回答前是否检索整个工作区 */
  workspaceSearch: boolean
  /** 是否请求模型进行深度思考 */
  thinkingMode: ThinkingMode
  theme: ThemeMode
  apiKey: string
}

export type PublicSettings = Omit<SettingsInput, 'apiKey'> & {
  hasApiKey: boolean
  apiKeyHint: string
  /** 规范化 baseUrl -> 掩码；仅包含已经保存过 Key 的地址 */
  apiKeyHints: Record<string, string>
}

export interface ConnectionCheck {
  ok: boolean
  error?: string
}

/** Remda 支持的上游协议 */
export type LlmProtocol = 'openai-chat' | 'openai-responses' | 'anthropic' | 'google'

export interface CatalogModel {
  id: string
  name: string
  /** models.dev 标记为 deprecated；仅在供应商没有任何活跃模型时才保留 */
  deprecated?: boolean
  /** 混合协议网关里该模型使用的协议；缺省表示按供应商默认协议 */
  protocol?: LlmProtocol
  /** 模型级请求基址；只在网关为不同协议提供不同 endpoint 时出现 */
  apiBase?: string
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
  /** 仅 E2E 使用：启动时自动打开的工作区文件夹 */
  e2eFolder?: string
}

export interface WorkspaceSource {
  /** 相对工作区的路径，使用 / 分隔 */
  path: string
  heading: string
}

export interface WorkspaceRetrieveRequest {
  root: string
  docPath?: string
  question: string
  selection?: string
  /** 检索区块可用的字符预算 */
  budget: number
}

export interface WorkspaceRetrieveResult {
  block: string
  sources: WorkspaceSource[]
  /** 扫描到的 Markdown 文件数 */
  scanned: number
  truncated: boolean
}
