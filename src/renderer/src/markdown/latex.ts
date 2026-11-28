interface Range {
  start: number
  end: number
}

interface Line {
  text: string
  start: number
}

const splitLines = (text: string): Line[] => {
  const lines: Line[] = []
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') continue
    lines.push({ text: text.slice(start, i + 1), start })
    start = i + 1
  }
  if (start < text.length) lines.push({ text: text.slice(start), start })
  return lines
}

/** 围栏代码块（``` / ~~~）整体跳过，避免把示例里的 \( 转成公式。 */
function fencedRanges(text: string): Range[] {
  const ranges: Range[] = []
  let open: { char: string; length: number; start: number } | null = null

  for (const line of splitLines(text)) {
    if (!open) {
      const match = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line.text)
      if (match) {
        open = {
          char: match[1]![0]!,
          length: match[1]!.length,
          start: line.start
        }
      }
      continue
    }
    const close = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*\r?\n?$/.exec(line.text)
    if (close && close[1]![0] === open.char && close[1]!.length >= open.length) {
      ranges.push({ start: open.start, end: line.start + line.text.length })
      open = null
    }
  }

  if (open) ranges.push({ start: open.start, end: text.length })
  return ranges
}

const inside = (ranges: Range[], index: number): boolean =>
  ranges.some((range) => index >= range.start && index < range.end)

const rangeEnd = (ranges: Range[], index: number): number =>
  ranges.find((range) => index >= range.start && index < range.end)?.end ?? index + 1

/** 行内代码 `...` 同样保持原样。 */
function inlineCodeRanges(text: string, fences: Range[]): Range[] {
  const ranges: Range[] = []
  let i = 0

  while (i < text.length) {
    if (inside(fences, i)) {
      i = rangeEnd(fences, i)
      continue
    }
    if (text[i] !== '`') {
      i += 1
      continue
    }

    let length = 0
    while (text[i + length] === '`') length += 1
    const contentStart = i + length
    let cursor = contentStart
    let end = -1

    while (cursor < text.length) {
      if (inside(fences, cursor)) {
        cursor = rangeEnd(fences, cursor)
        continue
      }
      if (text[cursor] !== '`') {
        cursor += 1
        continue
      }
      let run = 0
      while (text[cursor + run] === '`') run += 1
      if (run === length) {
        end = cursor + run
        break
      }
      cursor += run
    }

    if (end === -1) {
      i = contentStart
      continue
    }
    ranges.push({ start: i, end })
    i = end
  }

  return ranges
}

const isEscaped = (text: string, index: number): boolean => {
  let count = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) count += 1
  return count % 2 === 1
}

/** 已经用 $ / $$ 写好的公式不再处理，避免重复包裹。 */
function mathRanges(text: string, exclusions: Range[]): Range[] {
  const ranges: Range[] = []
  let i = 0

  while (i < text.length) {
    if (inside(exclusions, i)) {
      i = rangeEnd(exclusions, i)
      continue
    }
    if (text[i] !== '$' || isEscaped(text, i)) {
      i += 1
      continue
    }

    const double = text[i + 1] === '$'
    const marker = double ? '$$' : '$'
    if (!double) {
      const next = text[i + 1]
      if (!next || /\s/.test(next)) {
        i += 1
        continue
      }
    }

    let cursor = i + marker.length
    let close = -1
    while (cursor < text.length) {
      if (inside(exclusions, cursor)) {
        cursor = rangeEnd(exclusions, cursor)
        continue
      }
      if (text.startsWith(marker, cursor) && !isEscaped(text, cursor)) {
        if (double || !/\s/.test(text[cursor - 1] ?? '')) {
          close = cursor
          break
        }
      }
      cursor += 1
    }

    if (close === -1) {
      i += marker.length
      continue
    }
    ranges.push({ start: i, end: close + marker.length })
    i = close + marker.length
  }

  return ranges
}

const findClosing = (text: string, needle: string, from: number): number => {
  let index = text.indexOf(needle, from)
  while (index !== -1) {
    if (!isEscaped(text, index)) return index
    index = text.indexOf(needle, index + needle.length)
  }
  return -1
}

/**
 * 兼容模型常用的 \(...\) / \[...\] 数学分隔符。
 * 必须在 Markdown 解析前执行：解析器会把反斜杠当转义符吃掉。
 */
export function normalizeLatexDelimiters(markdown: string): string {
  if (!markdown.includes('\\(') && !markdown.includes('\\[')) return markdown

  const fences = fencedRanges(markdown)
  const inlineCode = inlineCodeRanges(markdown, fences)
  const math = mathRanges(markdown, [...fences, ...inlineCode])
  const protectedRanges = [...fences, ...inlineCode, ...math].sort((a, b) => a.start - b.start)

  let out = ''
  let i = 0
  let rangeIndex = 0

  while (i < markdown.length) {
    while (rangeIndex < protectedRanges.length && protectedRanges[rangeIndex]!.end <= i) {
      rangeIndex += 1
    }
    const range = protectedRanges[rangeIndex]
    if (range && i >= range.start) {
      out += markdown.slice(i, range.end)
      i = range.end
      continue
    }

    if (markdown[i] === '\\') {
      // 两个反斜杠是用户刻意写成字面量 \(，不要转换。
      if (markdown[i + 1] === '\\') {
        out += '\\\\'
        i += 2
        continue
      }
      if (markdown[i + 1] === '(') {
        const close = findClosing(markdown, '\\)', i + 2)
        if (close !== -1) {
          const body = markdown.slice(i + 2, close)
          if (body && !body.includes('\n') && !body.includes('\r')) {
            out += `$${body}$`
            i = close + 2
            continue
          }
        }
      }
      if (markdown[i + 1] === '[') {
        const close = findClosing(markdown, '\\]', i + 2)
        if (close !== -1) {
          const body = markdown.slice(i + 2, close).trim()
          if (body) {
            out += `$$\n${body}\n$$`
            i = close + 2
            continue
          }
        }
      }
    }

    out += markdown[i]
    i += 1
  }

  return out
}
