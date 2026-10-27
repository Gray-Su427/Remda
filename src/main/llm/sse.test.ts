/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { parseSseEvents } from './sse'

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const out: { event: string | null; data: string }[] = []
  for await (const event of parseSseEvents(stream)) out.push(event)
  return out
}

describe('parseSseEvents', () => {
  it('parses events split across chunk boundaries', async () => {
    const events = await collect(
      sseStream(['event: delta\ndata: {"text":"你"}\n\nda', 'ta: {"text":"好"}\n\n'])
    )
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"你"}' },
      { event: null, data: '{"text":"好"}' }
    ])
  })

  it('handles CRLF line endings', async () => {
    const events = await collect(sseStream(['event: ping\r\ndata: {"ok":1}\r\n\r\n']))
    expect(events).toEqual([{ event: 'ping', data: '{"ok":1}' }])
  })

  it('joins multi-line data with a newline', async () => {
    const events = await collect(sseStream(['data: line1\ndata: line2\n\n']))
    expect(events).toEqual([{ event: null, data: 'line1\nline2' }])
  })

  it('flushes the last event when the stream ends without a blank line', async () => {
    const events = await collect(sseStream(['data: {"done":true}']))
    expect(events).toEqual([{ event: null, data: '{"done":true}' }])
  })

  it('ignores comments and events without data', async () => {
    const events = await collect(sseStream([': keep-alive\n\nevent: ping\n\n']))
    expect(events).toEqual([])
  })
})
