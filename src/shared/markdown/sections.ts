import GithubSlugger from 'github-slugger'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { Heading, Root } from 'mdast'

export interface Section {
  id: string
  title: string
  depth: number
  start: number
  end: number
  /** 该小节的原文切片，供上下文构建直接复用 */
  text: string
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

function parse(md: string): Root {
  return parser.parse(md) as Root
}

function headingText(node: Heading): string {
  let text = ''
  const walk = (n: unknown): void => {
    const current = n as { type?: string; value?: string; children?: unknown[] }
    if (current.type === 'text' || current.type === 'inlineCode') text += current.value ?? ''
    if (current.type === 'math' || current.type === 'inlineMath') text += current.value ?? ''
    for (const child of current.children ?? []) walk(child)
  }
  walk(node)
  return text.trim()
}

export function extractSections(md: string): Section[] {
  const root = parse(md)
  const slugger = new GithubSlugger()
  const headings: { id: string; title: string; depth: number; offset: number }[] = []

  for (const node of root.children) {
    if (node.type !== 'heading') continue
    const title = headingText(node)
    headings.push({
      id: slugger.slug(title),
      title,
      depth: node.depth,
      offset: node.position?.start.offset ?? 0
    })
  }

  return headings.map((h, i) => {
    const end = headings[i + 1]?.offset ?? md.length
    return {
      id: h.id,
      title: h.title,
      depth: h.depth,
      start: h.offset,
      end,
      text: md.slice(h.offset, end)
    }
  })
}

export function outlineText(md: string): string {
  return extractSections(md)
    .map((s) => `${'  '.repeat(Math.max(0, s.depth - 1))}- ${s.title}`)
    .join('\n')
}

export function sectionAt(md: string, id: string): Section | undefined {
  return extractSections(md).find((s) => s.id === id)
}

export function documentTitle(md: string, fallback: string): string {
  const h1 = extractSections(md).find((s) => s.depth === 1)
  return h1?.title || fallback
}
