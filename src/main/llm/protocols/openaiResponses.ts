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
  url: endpoint(input.baseUrl, '/responses'),
  headers: bearerHeaders(input.baseUrl, input.apiKey, input.sessionId),
  body: {
    model: input.model,
    input: input.messages.map((message) => ({
      role: message.role,
      content: [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content
        }
      ]
    })),
    // GPT-6 / Codex 系不再接受 temperature，统一不发送
    stream: true,
    store: false
  }
})

const parse = (data: string): ParsedEvent | null => {
  if (data === '[DONE]') return null
  const payload = asRecord(JSON.parse(data))
  const type = asString(payload?.type)
  if (!type) return null

  if (type === 'response.output_text.delta') {
    const text = asString(payload?.delta)
    return text ? { text } : null
  }
  if (type === 'error') {
    const message =
      asString(asRecord(payload?.error)?.message) ?? asString(payload?.message) ?? '模型返回错误'
    return { error: message }
  }
  if (type === 'response.failed' || type === 'response.incomplete') {
    const error = asRecord(asRecord(payload?.response)?.error)
    return { error: asString(error?.message) ?? '模型未能完成本次生成' }
  }
  return null
}

const listModels = (input: ModelListInput): BuiltRequest => ({
  url: endpoint(input.baseUrl, '/models'),
  headers: bearerHeaders(input.baseUrl, input.apiKey, input.sessionId)
})

export const openaiResponsesAdapter: ProtocolAdapter = { build, parse, listModels }
