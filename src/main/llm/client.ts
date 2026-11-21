import { AppError } from '@shared/errors'
import type { LlmMessage } from '@shared/ipc'
import { baseUrlKey } from '@shared/providers'
import type { LlmProtocol, ThinkingMode } from '@shared/types'
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
  thinking?: ThinkingMode
  signal: AbortSignal
  /** OpenCode / Go 用：稳定的会话标识 */
  sessionId?: string
  /** 非致命提示，例如思考参数被服务商拒绝后的回退 */
  onNotice?: (message: string) => void
  fetchImpl?: typeof fetch
}

const effectiveBaseUrl = (input: { baseUrl: string; apiBase?: string }): string =>
  input.apiBase?.trim() || input.baseUrl

/** 服务商明确拒绝思考参数时用这个信号触发一次无参数重试。 */
class ThinkingUnsupported extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`thinking unsupported (${status})`)
    this.name = 'ThinkingUnsupported'
  }
}

const unsupportedThinking = new Set<string>()

export function clearThinkingSupportCache(): void {
  unsupportedThinking.clear()
}

const thinkingKey = (protocol: LlmProtocol, baseUrl: string, model: string): string =>
  `${protocol}|${baseUrlKey(baseUrl)}|${model}`

async function* runStream(input: StreamChatInput, thinking: ThinkingMode): AsyncGenerator<string> {
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
    thinking,
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
    const body = await response.text().catch(() => '')
    if ((response.status === 400 || response.status === 422) && thinking !== 'auto') {
      throw new ThinkingUnsupported(response.status, body)
    }
    throw httpError(response.status, body)
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

export async function* streamChat(input: StreamChatInput): AsyncGenerator<string> {
  const protocol = input.protocol ?? 'openai-chat'
  const baseUrl = effectiveBaseUrl(input)
  const thinking = input.thinking ?? 'auto'
  const key = thinkingKey(protocol, baseUrl, input.model)

  if (thinking === 'auto' || unsupportedThinking.has(key)) {
    yield* runStream(input, 'auto')
    return
  }

  try {
    yield* runStream(input, thinking)
  } catch (error) {
    if (!(error instanceof ThinkingUnsupported)) throw error
    unsupportedThinking.add(key)
    input.onNotice?.('该模型不支持深度思考，已按自动模式重试')
    yield* runStream(input, 'auto')
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
