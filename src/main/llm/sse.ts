export interface SseEvent {
  /** `event:` 字段；部分服务端不发送 */
  event: string | null
  /** 同一事件内多行 `data:` 按规范用 \n 连接 */
  data: string
}

interface RawFields {
  event: string | null
  dataLines: string[]
}

const readEvent = (raw: string): RawFields => {
  let event: string | null = null
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      // 规范允许冒号后跟一个空格；其余空白保留在数据里
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  return { event, dataLines }
}

/**
 * 通用 SSE 解析：兼容 \r\n、跨 chunk 的换行、多行 data 与末尾没有空行的事件。
 * 只处理 `event:` / `data:`，忽略 id / retry / 注释行。
 */
export async function* parseSseEvents(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buffer = ''

  const consume = function* (): Generator<SseEvent> {
    // 逐次归一化，避免 \r\n 恰好被切在两个 chunk 之间
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const raw = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      index = buffer.indexOf('\n\n')
      const { event, dataLines } = readEvent(raw)
      if (dataLines.length > 0) yield { event, data: dataLines.join('\n') }
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      yield* consume()
    }
    buffer += decoder.decode()
    yield* consume()
    if (buffer.trim()) {
      const { event, dataLines } = readEvent(buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))
      buffer = ''
      if (dataLines.length > 0) yield { event, data: dataLines.join('\n') }
    }
  } finally {
    reader.releaseLock()
  }
}
