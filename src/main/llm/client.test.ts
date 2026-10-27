/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { streamChat, testConnection, type StreamChatInput } from './client'

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

type Call = [string, RequestInit]

const callsOf = (fetchImpl: typeof fetch): Call[] =>
  (fetchImpl as unknown as { mock: { calls: Call[] } }).mock.calls

const fakeFetch = (chunks: string[]): typeof fetch =>
  vi.fn(
    async () => new Response(sseStream(chunks), { status: 200 })
  ) as unknown as typeof fetch

const run = async (input: StreamChatInput): Promise<string[]> => {
  const out: string[] = []
  for await (const text of streamChat(input)) out.push(text)
  return out
}

const base: Omit<StreamChatInput, 'fetchImpl'> = {
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  temperature: 0.3,
  signal: new AbortController().signal
}

describe('streamChat / openai-chat', () => {
  it('posts to /chat/completions with bearer auth and streams deltas', async () => {
    const fetchImpl = fakeFetch([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: [DONE]\n\n'
    ])
    expect(await run({ ...base, fetchImpl })).toEqual(['ok'])

    const [url, init] = callsOf(fetchImpl)[0]!
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    expect(headers['User-Agent']).toBe('Remda')
    expect(JSON.parse(String(init.body)).stream).toBe(true)
  })

  it('identifies OpenCode sessions with x-opencode-session', async () => {
    const fetchImpl = fakeFetch(['data: [DONE]\n\n'])
    await run({
      ...base,
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      sessionId: 's1',
      fetchImpl
    })

    const headers = callsOf(fetchImpl)[0]![1].headers as Record<string, string>
    expect(headers['x-opencode-session']).toBe('s1')
  })

  it('surfaces in-stream errors', async () => {
    const fetchImpl = fakeFetch(['data: {"error":{"message":"quota"}}\n\n'])
    await expect(run({ ...base, fetchImpl })).rejects.toMatchObject({
      code: 'LLM_STREAM_ERROR',
      message: 'quota'
    })
  })
})

describe('streamChat / anthropic', () => {
  it('uses the messages endpoint, native headers and extracts system messages', async () => {
    const fetchImpl = fakeFetch([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    ])

    const out = await run({
      ...base,
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      temperature: 1.6,
      messages: [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: 'hi' }
      ],
      fetchImpl
    })
    expect(out).toEqual(['你好'])

    const [url, init] = callsOf(fetchImpl)[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers.Authorization).toBeUndefined()

    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.system).toBe('你是助手')
    expect(body.max_tokens).toBe(8192)
    expect(body.temperature).toBe(1)
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.stream).toBe(true)
  })

  it('uses a model-level endpoint and adds bearer auth for OpenCode', async () => {
    const fetchImpl = fakeFetch(['data: {"type":"message_stop"}\n\n'])
    await run({
      ...base,
      protocol: 'anthropic',
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      apiBase: 'https://opencode.ai/inference/go/anthropic/v1',
      fetchImpl
    })

    const [url, init] = callsOf(fetchImpl)[0]!
    expect(url).toBe('https://opencode.ai/inference/go/anthropic/v1/messages')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })
})

describe('streamChat / openai-responses', () => {
  it('uses /responses with the responses input shape and no temperature', async () => {
    const fetchImpl = fakeFetch([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed"}\n\n'
    ])

    const out = await run({
      ...base,
      protocol: 'openai-responses',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' }
      ],
      fetchImpl
    })
    expect(out).toEqual(['ok'])

    const [url, init] = callsOf(fetchImpl)[0]!
    expect(url).toBe('https://api.example.com/v1/responses')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.stream).toBe(true)
    expect(body.store).toBe(false)
    expect(body.temperature).toBeUndefined()
    expect(body.input).toEqual([
      { role: 'system', content: [{ type: 'input_text', text: 'sys' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] }
    ])
  })

  it('maps response.failed to a readable error', async () => {
    const fetchImpl = fakeFetch([
      'event: response.failed\ndata: {"type":"response.failed","response":{"error":{"message":"bad"}}}\n\n'
    ])
    await expect(run({ ...base, protocol: 'openai-responses', fetchImpl })).rejects.toMatchObject({
      code: 'LLM_STREAM_ERROR',
      message: 'bad'
    })
  })
})

describe('streamChat / google', () => {
  it('uses streamGenerateContent, header auth and skips thought parts', async () => {
    const fetchImpl = fakeFetch([
      'data: {"candidates":[{"content":{"parts":[{"text":"a"},{"text":"think","thought":true},{"text":"b"}]}}]}\n\n'
    ])

    const out = await run({
      ...base,
      protocol: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-3.8-flash',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ],
      fetchImpl
    })
    expect(out).toEqual(['ab'])

    const [url, init] = callsOf(fetchImpl)[0]!
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse'
    )
    const headers = init.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe('sk-test')
    expect(headers.Authorization).toBeUndefined()

    const body = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: { text: string }[] }
      contents: { role: string; parts: { text: string }[] }[]
    }
    expect(body.systemInstruction.parts[0]!.text).toBe('sys')
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'hello' }] }
    ])
  })

  it('surfaces blocked prompts', async () => {
    const fetchImpl = fakeFetch(['data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'])
    await expect(run({ ...base, protocol: 'google', fetchImpl })).rejects.toThrow(
      'Gemini 拒绝了该请求（SAFETY）'
    )
  })
})

describe('streamChat / errors', () => {
  it('maps 401 to a readable chinese error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('unauthorized', { status: 401 })
    ) as unknown as typeof fetch
    await expect(run({ ...base, fetchImpl })).rejects.toMatchObject({
      code: 'LLM_UNAUTHORIZED'
    })
  })

  it('maps network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    await expect(run({ ...base, fetchImpl })).rejects.toMatchObject({ code: 'LLM_NETWORK' })
  })
})

describe('testConnection', () => {
  it('ok when /models returns 200', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"data":[]}', { status: 200 })
    ) as unknown as typeof fetch
    await expect(
      testConnection({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl })
    ).resolves.toEqual({ ok: true })
  })

  it('uses modelsUrl and OpenCode headers when testing a coding plan', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"data":[]}', { status: 200 })
    ) as unknown as typeof fetch
    await testConnection({
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      apiKey: 'k',
      model: 'm',
      modelsUrl: 'https://opencode.ai/inference/go/v1/models',
      sessionId: 's1',
      fetchImpl
    })
    const [url, init] = callsOf(fetchImpl)[0]!
    expect(url).toBe('https://opencode.ai/inference/go/v1/models')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer k')
    expect(headers['x-opencode-session']).toBe('s1')
  })

  it('uses native auth headers and list endpoints', async () => {
    const anthropicFetch = vi.fn(
      async () => new Response('{"data":[]}', { status: 200 })
    ) as unknown as typeof fetch
    await testConnection({
      baseUrl: 'https://api.anthropic.com/v1',
      protocol: 'anthropic',
      apiKey: 'k',
      model: 'claude',
      fetchImpl: anthropicFetch
    })
    const [anthropicUrl, anthropicInit] = callsOf(anthropicFetch)[0]!
    expect(anthropicUrl).toBe('https://api.anthropic.com/v1/models')
    expect((anthropicInit.headers as Record<string, string>)['x-api-key']).toBe('k')

    const googleFetch = vi.fn(
      async () => new Response('{"models":[]}', { status: 200 })
    ) as unknown as typeof fetch
    await testConnection({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      protocol: 'google',
      apiKey: 'g',
      model: 'gemini',
      fetchImpl: googleFetch
    })
    const [googleUrl, googleInit] = callsOf(googleFetch)[0]!
    expect(googleUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect((googleInit.headers as Record<string, string>)['x-goog-api-key']).toBe('g')
  })

  it('returns the mapped message on failure', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 404 })
    ) as unknown as typeof fetch
    const result = await testConnection({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      fetchImpl
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('404')
  })
})
