import { AppError } from '@shared/errors'
import type { LlmMessage } from '@shared/ipc'
import { httpError } from './errors'

export interface StreamChatInput {
  baseUrl: string
  apiKey: string
  model: string
  messages: LlmMessage[]
  temperature: number
  signal: AbortSignal
  /** OpenCode / Go 用：稳定的会话标识 */
  sessionId?: string
  fetchImpl?: typeof fetch
}

const endpoint = (baseUrl: string, path: string): string => `${baseUrl.replace(/\/+$/, '')}${path}`

const isOpenCodeBaseUrl = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname === 'opencode.ai'
  } catch {
    return false
  }
}

const authHeaders = (
  baseUrl: string,
  apiKey: string,
  sessionId?: string
): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'Remda'
  }
  if (isOpenCodeBaseUrl(baseUrl)) {
    headers['x-opencode-session'] = sessionId ?? 'remda'
  }
  return headers
}

interface SsePayload {
  choices?: { delta?: { content?: string | null } }[]
}

export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = stream.getReader()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let index = buffer.indexOf('\n\n')
      while (index >= 0) {
        const rawEvent = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        index = buffer.indexOf('\n\n')

        for (const line of rawEvent.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          let parsed: SsePayload
          try {
            parsed = JSON.parse(data) as SsePayload
          } catch {
            continue
          }
          const text = parsed.choices?.[0]?.delta?.content
          if (typeof text === 'string' && text.length > 0) yield text
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function* streamChat(input: StreamChatInput): AsyncGenerator<string> {
  const doFetch = input.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch(endpoint(input.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(input.baseUrl, input.apiKey, input.sessionId)
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        stream: true
      }),
      signal: input.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new AppError('LLM_NETWORK', `无法连接 ${input.baseUrl}，请检查网络或 baseURL`)
  }

  if (!response.ok) {
    throw httpError(response.status, await response.text().catch(() => ''))
  }
  if (!response.body) throw new AppError('LLM_EMPTY', '模型返回了空响应')

  yield* parseSse(response.body)
}

export async function testConnection(input: {
  baseUrl: string
  apiKey: string
  model: string
  modelsUrl?: string
  sessionId?: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; error?: string }> {
  const doFetch = input.fetchImpl ?? fetch
  try {
    const response = await doFetch(input.modelsUrl ?? endpoint(input.baseUrl, '/models'), {
      headers: authHeaders(input.baseUrl, input.apiKey, input.sessionId),
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      const error = httpError(response.status, await response.text().catch(() => ''))
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message }
    return { ok: false, error: `无法连接 ${input.baseUrl}，请检查网络或 baseURL` }
  }
}
