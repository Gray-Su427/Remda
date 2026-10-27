import { AppError } from '@shared/errors'
import type { LlmMessage } from '@shared/ipc'
import type { LlmProtocol } from '@shared/types'
import { httpError } from './errors'
import { anthropicAdapter } from './protocols/anthropic'
import { bearerHeaders } from './protocols/common'
import { googleAdapter } from './protocols/google'
import { openaiChatAdapter } from './protocols/openaiChat'
import { openaiResponsesAdapter } from './protocols/openaiResponses'
import type { BuiltRequest, ProtocolAdapter } from './protocols/types'
import { parseSseEvents } from './sse'

const ADAPTERS: Record<LlmProtocol, ProtocolAdapter> = {
  'openai-chat': openaiChatAdapter,
  'openai-responses': openaiResponsesAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter
}

export interface StreamChatInput {
  baseUrl: string
  /** 模型级请求基址；空表示沿用 baseUrl */
  apiBase?: string
  protocol?: LlmProtocol
  apiKey: string
  model: string
  messages: LlmMessage[]
  temperature: number
  signal: AbortSignal
  /** OpenCode / Go 用：稳定的会话标识 */
  sessionId?: string
  fetchImpl?: typeof fetch
}

const effectiveBaseUrl = (input: { baseUrl: string; apiBase?: string }): string =>
  input.apiBase?.trim() || input.baseUrl

export async function* streamChat(input: StreamChatInput): AsyncGenerator<string> {
  const doFetch = input.fetchImpl ?? fetch
  const protocol = input.protocol ?? 'openai-chat'
  const adapter = ADAPTERS[protocol]
  const baseUrl = effectiveBaseUrl(input)
  const request = adapter.build({
    baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: input.messages,
    temperature: input.temperature,
    sessionId: input.sessionId
  })

  let response: Response
  try {
    response = await doFetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: input.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new AppError('LLM_NETWORK', `无法连接 ${baseUrl}，请检查网络或 baseURL`)
  }

  if (!response.ok) {
    throw httpError(response.status, await response.text().catch(() => ''))
  }
  if (!response.body) throw new AppError('LLM_EMPTY', '模型返回了空响应')

  for await (const event of parseSseEvents(response.body)) {
    if (!event.data || event.data === '[DONE]') continue
    let parsed: ReturnType<ProtocolAdapter['parse']>
    try {
      parsed = adapter.parse(event.data)
    } catch {
      // 忽略心跳、注释或非 JSON 数据
      continue
    }
    if (!parsed) continue
    if ('error' in parsed) throw new AppError('LLM_STREAM_ERROR', parsed.error)
    yield parsed.text
  }
}

export interface TestConnectionInput {
  baseUrl: string
  apiKey: string
  model: string
  protocol?: LlmProtocol
  apiBase?: string
  modelsUrl?: string
  sessionId?: string
  fetchImpl?: typeof fetch
}

export async function testConnection(
  input: TestConnectionInput
): Promise<{ ok: boolean; error?: string }> {
  const doFetch = input.fetchImpl ?? fetch
  const protocol = input.protocol ?? 'openai-chat'
  const adapter = ADAPTERS[protocol]
  const baseUrl = effectiveBaseUrl(input)

  // modelsUrl 是公开的 OpenAI 风格列表地址（例如 OpenCode / Go），统一用 Bearer。
  const request: BuiltRequest = input.modelsUrl
    ? {
        url: input.modelsUrl,
        headers: bearerHeaders(input.modelsUrl, input.apiKey, input.sessionId)
      }
    : adapter.listModels({ baseUrl, apiKey: input.apiKey, sessionId: input.sessionId })

  try {
    const response = await doFetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      const error = httpError(response.status, await response.text().catch(() => ''))
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message }
    return { ok: false, error: `无法连接 ${baseUrl}，请检查网络或 baseURL` }
  }
}
