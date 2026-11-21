import { createServer } from 'node:http'
import type { Server } from 'node:http'

/** 1x1 透明 PNG，用于图片渲染用例 */
export const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

export interface MockLlmOptions {
  chunks?: string[]
  /** 在正文之前发送的思考片段（OpenAI Chat 的 reasoning_content） */
  reasoningChunks?: string[]
  intervalMs?: number
}

export interface MockLlmResult {
  server: Server
  url: string
  /** 按到达顺序保存的请求体，便于断言上下文确实包含了工作区片段 */
  requests: Record<string, unknown>[]
}

export function startMockLlm(
  port = 0,
  options: MockLlmOptions = {}
): Promise<MockLlmResult> {
  const chunks = options.chunks ?? ['这是', '来自', ' mock 的回答']
  const reasoningChunks = options.reasoningChunks ?? []
  const intervalMs = options.intervalMs ?? 20
  const requests: Record<string, unknown>[] = []

  const server = createServer((req, res) => {
    if (req.url === '/pixel.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
      res.end(PIXEL_PNG)
      return
    }
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock' }] }))
      return
    }
    if (req.url === '/v1/chat/completions' || req.url === '/v1/messages') {
      const anthropic = req.url === '/v1/messages'
      const parts: Buffer[] = []
      req.on('data', (chunk) => {
        parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      })
      req.on('end', () => {
        const raw = Buffer.concat(parts).toString('utf8')
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>
          requests.push(parsed)
        } catch {
          requests.push({ raw })
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        })
        const events = [
          ...reasoningChunks.map((text) => ({ kind: 'reasoning' as const, text })),
          ...chunks.map((text) => ({ kind: 'text' as const, text }))
        ]
        let index = 0
        const timer = setInterval(() => {
          if (index >= events.length) {
            if (anthropic) {
              res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n')
            } else {
              res.write('data: [DONE]\n\n')
            }
            clearInterval(timer)
            res.end()
            return
          }
          const event = events[index]!
          if (anthropic) {
            res.write(
              `event: content_block_delta\ndata: ${JSON.stringify({
                type: 'content_block_delta',
                delta:
                  event.kind === 'reasoning'
                    ? { type: 'thinking_delta', thinking: event.text }
                    : { type: 'text_delta', text: event.text }
              })}\n\n`
            )
          } else if (event.kind === 'reasoning') {
            res.write(
              `data: ${JSON.stringify({
                choices: [{ delta: { reasoning_content: event.text } }]
              })}\n\n`
            )
          } else {
            res.write(
              `data: ${JSON.stringify({ choices: [{ delta: { content: event.text } }] })}\n\n`
            )
          }
          index += 1
        }, intervalMs)
        res.on('close', () => clearInterval(timer))
      })
      return
    }
    res.writeHead(404).end()
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({ server, url: `http://127.0.0.1:${actualPort}/v1`, requests })
    })
  })
}
