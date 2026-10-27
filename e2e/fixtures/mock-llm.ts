import { createServer } from 'node:http'
import type { Server } from 'node:http'

/** 1x1 透明 PNG，用于图片渲染用例 */
export const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

export function startMockLlm(port = 0): Promise<{ server: Server; url: string }> {
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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      const chunks = ['这是', '来自', ' mock 的回答']
      let index = 0
      const timer = setInterval(() => {
        if (index >= chunks.length) {
          if (anthropic) {
            res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n')
          } else {
            res.write('data: [DONE]\n\n')
          }
          clearInterval(timer)
          res.end()
          return
        }
        const chunk = chunks[index]
        if (anthropic) {
          res.write(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: chunk }
            })}\n\n`
          )
        } else {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        }
        index += 1
      }, 20)
      req.on('close', () => clearInterval(timer))
      return
    }
    res.writeHead(404).end()
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({ server, url: `http://127.0.0.1:${actualPort}/v1` })
    })
  })
}
