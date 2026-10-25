import { createServer } from 'node:http'
import type { Server } from 'node:http'

export function startMockLlm(port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock' }] }))
      return
    }
    if (req.url === '/v1/chat/completions') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      const chunks = ['这是', '来自', ' mock 的回答']
      let index = 0
      const timer = setInterval(() => {
        if (index >= chunks.length) {
          res.write('data: [DONE]\n\n')
          clearInterval(timer)
          res.end()
          return
        }
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[index] } }] })}\n\n`)
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
