/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { parseSse, streamChat, testConnection } from './openaiClient'

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

describe('parseSse', () => {
  it('yields delta contents across chunk boundaries', async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choi',
      'ces":[{"delta":{"content":"好"}}]}\n\n'
    ])
    const out: string[] = []
    for await (const text of parseSse(stream)) out.push(text)
    expect(out.join('')).toBe('你好')
  })

  it('ignores [DONE], empty lines and malformed payloads', async () => {
    const stream = sseStream([
      'data: not-json\n\n',
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: [DONE]\n\n'
    ])
    const out: string[] = []
    for await (const text of parseSse(stream)) out.push(text)
    expect(out).toEqual([])
  })
})

describe('streamChat', () => {
  const base = {
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-test',
    model: 'm',
    messages: [{ role: 'user' as const, content: 'hi' }],
    temperature: 0.3,
    signal: new AbortController().signal
  }

  it('posts to /chat/completions with bearer auth and streams deltas', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          sseStream(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']),
          { status: 200 }
        )
    ) as unknown as typeof fetch

    const out: string[] = []
    for await (const text of streamChat({ ...base, fetchImpl })) out.push(text)

    expect(out).toEqual(['ok'])
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Remda')
    expect(JSON.parse(String(init.body)).stream).toBe(true)
  })

  it('identifies OpenCode sessions with x-opencode-session', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(sseStream(['data: [DONE]\n\n']), { status: 200 })
    ) as unknown as typeof fetch

    for await (const _ of streamChat({
      ...base,
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      sessionId: 's1',
      fetchImpl
    })) {
      void _
    }

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    const headers = init.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('Remda')
    expect(headers['x-opencode-session']).toBe('s1')
  })

  it('maps 401 to a readable chinese error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('unauthorized', { status: 401 })
    ) as unknown as typeof fetch
    const run = async (): Promise<void> => {
      for await (const _ of streamChat({ ...base, fetchImpl })) void _
    }
    await expect(run()).rejects.toMatchObject({ code: 'LLM_UNAUTHORIZED' })
    await expect(run()).rejects.toThrow('API Key 无效或无权限')
  })

  it('maps network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const run = async (): Promise<void> => {
      for await (const _ of streamChat({ ...base, fetchImpl })) void _
    }
    await expect(run()).rejects.toMatchObject({ code: 'LLM_NETWORK' })
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
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    expect(url).toBe('https://opencode.ai/inference/go/v1/models')
    const headers = init.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('Remda')
    expect(headers['x-opencode-session']).toBe('s1')
  })

  it('returns the mapped message on failure', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 404 })
    ) as unknown as typeof fetch
    const result = await testConnection({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('404')
  })
})
