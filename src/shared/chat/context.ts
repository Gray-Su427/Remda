import type { LlmMessage } from '@shared/ipc'
import type { ChatMessage } from '@shared/types'
import type { Section } from '../markdown/sections'
import { documentTitle, extractSections, outlineText } from '../markdown/sections'
import { SYSTEM_PROMPT, contextBlock } from './prompts'

export interface BuildContextInput {
  docPath: string
  markdown: string
  selection?: string
  activeSectionId?: string
  budget: number
}

export interface BuiltContext {
  system: string
  context: string
  truncated: boolean
}

const MAX_SELECTION = 8000
const MIN_BUDGET = 800

const clip = (text: string, max: number): { text: string; clipped: boolean } =>
  text.length <= max ? { text, clipped: false } : { text: text.slice(0, max), clipped: true }

function sectionWithNeighbors(sections: Section[], index: number, budget: number): string {
  const parts: string[] = []
  const order = [index, index - 1, index + 1, index - 2, index + 2]
  let used = 0
  for (const i of order) {
    const section = sections[i]
    if (!section) continue
    const text = section.text
    if (used + text.length > budget && parts.length > 0) continue
    parts.push(text)
    used += text.length
  }
  return parts.join('\n\n')
}

export function buildChatContext(input: BuildContextInput): BuiltContext {
  const budget = Math.max(input.budget, MIN_BUDGET)
  const sections = extractSections(input.markdown)
  const title = documentTitle(input.markdown, input.docPath.split(/[\\/]/).pop() ?? '未命名文档')
  const outline = outlineText(input.markdown)

  const selection = input.selection?.trim()
  const selectionBlock = selection
    ? (() => {
        const { text, clipped } = clip(selection, MAX_SELECTION)
        return `【用户选中】\n>>>\n${text}\n>>>${clipped ? '\n（选中内容过长，已截断）' : ''}`
      })()
    : ''

  const activeIndex = input.activeSectionId
    ? sections.findIndex((s) => s.id === input.activeSectionId)
    : -1

  let body: string
  let truncated: boolean
  let note = ''

  if (input.markdown.length + outline.length <= budget) {
    body = input.markdown
    truncated = false
  } else if (activeIndex >= 0) {
    const outlineCost = Math.min(outline.length, Math.floor(budget * 0.3))
    body = sectionWithNeighbors(sections, activeIndex, budget - outlineCost)
    truncated = true
    note = '文档较长，仅提供全文目录与当前阅读小节及其相邻小节。'
  } else {
    body = input.markdown.slice(0, Math.max(MIN_BUDGET, budget - outline.length))
    truncated = true
    note = '文档较长且未定位到阅读位置，仅提供文档开头部分。'
  }

  const context = contextBlock({ docPath: input.docPath, title, outline, body, truncated, note })
  return {
    system: SYSTEM_PROMPT,
    context: selectionBlock ? `${selectionBlock}\n\n${context}` : context,
    truncated
  }
}

export function buildRequestMessages(
  history: ChatMessage[],
  question: string,
  built: BuiltContext
): LlmMessage[] {
  const usable = history.filter((m) => !m.error && m.content.trim().length > 0).slice(-20)
  return [
    { role: 'system', content: built.system },
    { role: 'user', content: built.context },
    ...usable.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question }
  ]
}
