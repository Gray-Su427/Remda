import type { LlmMessage } from '@shared/ipc'

export interface ChatRequestInput {
  /** 实际请求基址：模型级 apiBase 或设置里的 baseUrl */
  baseUrl: string
  apiKey: string
  model: string
  messages: LlmMessage[]
  temperature: number
  sessionId?: string
}

export interface ModelListInput {
  baseUrl: string
  apiKey: string
  sessionId?: string
}

export interface BuiltRequest {
  url: string
  headers: Record<string, string>
  body?: unknown
}

/** 单条 SSE 数据解析结果：要么是增量文本，要么是流内错误。 */
export type ParsedEvent = { text: string } | { error: string }

export interface ProtocolAdapter {
  build(input: ChatRequestInput): BuiltRequest
  parse(data: string): ParsedEvent | null
  listModels(input: ModelListInput): BuiltRequest
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

export const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null
