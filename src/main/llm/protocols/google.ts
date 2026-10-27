import { endpoint, googleHeaders } from './common'
import {
  asRecord,
  asString,
  type BuiltRequest,
  type ChatRequestInput,
  type ModelListInput,
  type ParsedEvent,
  type ProtocolAdapter
} from './types'

const build = (input: ChatRequestInput): BuiltRequest => {
  const system = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const contents = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))

  return {
    url: `${endpoint(
      input.baseUrl,
      `/models/${encodeURIComponent(input.model)}:streamGenerateContent`
    )}?alt=sse`,
    headers: googleHeaders(input.baseUrl, input.apiKey, input.sessionId),
    body: {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: input.temperature }
    }
  }
}

const partText = (parts: unknown): string => {
  if (!Array.isArray(parts)) return ''
  const chunks: string[] = []
  for (const part of parts) {
    const record = asRecord(part)
    if (!record || record.thought === true) continue
    const text = asString(record.text)
    if (text) chunks.push(text)
  }
  return chunks.join('')
}

const parse = (data: string): ParsedEvent | null => {
  if (data === '[DONE]') return null
  const payload = asRecord(JSON.parse(data))
  if (!payload) return null

  const error = asString(asRecord(payload.error)?.message)
  if (error) return { error }

  const blockReason = asString(asRecord(payload.promptFeedback)?.blockReason)
  if (blockReason) return { error: `Gemini 拒绝了该请求（${blockReason}）` }

  const candidate = asRecord((payload.candidates as unknown[] | undefined)?.[0])
  const text = partText(asRecord(candidate?.content)?.parts)
  return text ? { text } : null
}

const listModels = (input: ModelListInput): BuiltRequest => ({
  url: endpoint(input.baseUrl, '/models'),
  headers: googleHeaders(input.baseUrl, input.apiKey, input.sessionId)
})

export const googleAdapter: ProtocolAdapter = { build, parse, listModels }
