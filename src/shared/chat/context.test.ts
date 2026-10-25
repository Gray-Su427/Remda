/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@shared/types'
import { buildChatContext, buildRequestMessages } from './context'
import { SYSTEM_PROMPT } from './prompts'

const shortDoc = '# 标题\n\n短文档正文。\n\n## 小节 A\n\nA 的内容。\n'
const longDoc =
  '# 长文\n\n' +
  Array.from({ length: 40 }, (_, i) => `## 第 ${i} 节\n\n${`内容${i}。`.repeat(200)}\n`).join('\n')

describe('buildChatContext', () => {
  it('includes the whole document when it fits the budget', () => {
    const built = buildChatContext({ docPath: 'a.md', markdown: shortDoc, budget: 20000 })
    expect(built.system).toBe(SYSTEM_PROMPT)
    expect(built.context).toContain('短文档正文。')
    expect(built.context).toContain('小节 A')
    expect(built.truncated).toBe(false)
  })

  it('truncates long documents to outline plus the active section', () => {
    const built = buildChatContext({
      docPath: 'long.md',
      markdown: longDoc,
      activeSectionId: '第-7-节',
      budget: 3000
    })
    expect(built.truncated).toBe(true)
    expect(built.context).toContain('第 7 节')
    expect(built.context).toContain('内容7。')
    expect(built.context).not.toContain('内容30。')
    expect(built.context.length).toBeLessThan(6500)
  })

  it('always includes the selection, even over budget', () => {
    const selection = '被选中的关键句子'
    const built = buildChatContext({
      docPath: 'long.md',
      markdown: longDoc,
      selection,
      activeSectionId: '第-1-节',
      budget: 1500
    })
    expect(built.context).toContain(selection)
    expect(built.context).toContain('用户选中')
  })

  it('caps a giant selection at 8000 chars', () => {
    const built = buildChatContext({
      docPath: 'a.md',
      markdown: 'x',
      selection: 'y'.repeat(12000),
      budget: 20000
    })
    expect(built.context.length).toBeLessThan(12000)
    expect(built.context).toContain('已截断')
  })

  it('degrades to the document head when no active section is known', () => {
    const built = buildChatContext({ docPath: 'long.md', markdown: longDoc, budget: 2000 })
    expect(built.context).toContain('长文')
    expect(built.truncated).toBe(true)
  })
})

describe('buildRequestMessages', () => {
  it('puts system first, context second, history third, question last', () => {
    const history: ChatMessage[] = [
      { id: '1', role: 'user', content: '旧问题', createdAt: 1 },
      { id: '2', role: 'assistant', content: '旧回答', createdAt: 2 }
    ]
    const built = buildChatContext({ docPath: 'a.md', markdown: shortDoc, budget: 20000 })
    const messages = buildRequestMessages(history, '新问题', built)
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'user', 'assistant', 'user'])
    expect(messages[1]?.content).toContain('短文档正文。')
    expect(messages.at(-1)?.content).toBe('新问题')
  })

  it('drops assistant error placeholders from history', () => {
    const history: ChatMessage[] = [
      { id: '1', role: 'assistant', content: '半截', createdAt: 1, error: '网络错误' }
    ]
    const built = buildChatContext({ docPath: 'a.md', markdown: shortDoc, budget: 20000 })
    const messages = buildRequestMessages(history, 'q', built)
    expect(messages.some((m) => m.content.includes('半截'))).toBe(false)
  })
})
