import { anthropicHeaders, endpoint } from './common'
import {
  asRecord,
  asString,
  type BuiltRequest,
  type ChatRequestInput,
  type ModelListInput,
  type ParsedEvent,
  type ProtocolAdapter
} from './types'

/** Anthropic 必须显式给出 max_tokens；Remda 不做输出预算设置，取一个通用上限。 */
const MAX_TOKENS = 8192

const clampTemperature = (value: number): number => Math.min(Math.max(value, 0), 1)

const build = (input: ChatRequestInput): BuiltRequest => {
  const system = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const messages = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }))

  return {
    url: endpoint(input.baseUrl, '/messages'),
    headers: anthropicHeaders(input.baseUrl, input.apiKey, input.sessionId),
    body: {
      model: input.model,
      max_tokens: MAX_TOKENS,
      temperature: clampTemperature(input.temperature),
      ...(system ? { system } : {}),
      messages,
      stream: true
    }
  }
}

const parse = (data: string): ParsedEvent | null => {
  if (data === '[DONE]') return null
  const payload = asRecord(JSON.parse(data))
  const type = asString(payload?.type)
  if (!type) return null

  if (type === 'content_block_delta') {
    const delta = asRecord(payload?.delta)
    if (asString(delta?.type) !== 'text_delta') return null
    const text = asString(delta?.text)
    return text ? { text } : null
  }
  if (type === 'error') {
    const message =
      asString(asRecord(payload?.error)?.message) ?? asString(payload?.message) ?? '模型返回错误'
    return { error: message }
  }
  return null
}

const listModels = (input: ModelListInput): BuiltRequest => ({
  url: endpoint(input.baseUrl, '/models'),
  headers: anthropicHeaders(input.baseUrl, input.apiKey, input.sessionId)
})

export const anthropicAdapter: ProtocolAdapter = { build, parse, listModels }
