import { bearerHeaders, endpoint } from './common'
import {
  asRecord,
  asString,
  type BuiltRequest,
  type ChatRequestInput,
  type ModelListInput,
  type ParsedEvent,
  type ProtocolAdapter
} from './types'

const build = (input: ChatRequestInput): BuiltRequest => ({
  url: endpoint(input.baseUrl, '/chat/completions'),
  headers: bearerHeaders(input.baseUrl, input.apiKey, input.sessionId),
  body: {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature,
    stream: true
  }
})

const parse = (data: string): ParsedEvent | null => {
  if (data === '[DONE]') return null
  const payload = asRecord(JSON.parse(data))
  const error = asString(asRecord(payload?.error)?.message)
  if (error) return { error }

  const choice = asRecord((payload?.choices as unknown[] | undefined)?.[0])
  const text = asString(asRecord(choice?.delta)?.content)
  return text ? { text } : null
}

const listModels = (input: ModelListInput): BuiltRequest => ({
  url: endpoint(input.baseUrl, '/models'),
  headers: bearerHeaders(input.baseUrl, input.apiKey, input.sessionId)
})

export const openaiChatAdapter: ProtocolAdapter = { build, parse, listModels }
