/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import {
  buildPlannerPrompt,
  parseRetrievalPlan,
  PLANNER_SYSTEM_PROMPT
} from './chatPlanner'

const allowed = ['README.md', 'ch01/1.10-Sylow定理.md', 'ch04/4.6-Galois扩张.md']

describe('parseRetrievalPlan', () => {
  it('parses a plain JSON plan', () => {
    const plan = parseRetrievalPlan(
      JSON.stringify({
        files: [{ path: 'ch01/1.10-Sylow定理.md', heading: '1.10 Sylow 定理' }],
        keywords: ['Sylow', '第一定理']
      }),
      allowed
    )
    expect(plan).toEqual({
      files: [{ path: 'ch01/1.10-Sylow定理.md', heading: '1.10 Sylow 定理' }],
      keywords: ['Sylow', '第一定理']
    })
  })

  it('extracts JSON from a markdown code block', () => {
    const plan = parseRetrievalPlan(
      '```json\n{"files":["README.md"],"keywords":[]}\n```',
      allowed
    )
    expect(plan?.files).toEqual([{ path: 'README.md' }])
  })

  it('drops unknown, absolute and traversal paths', () => {
    const plan = parseRetrievalPlan(
      JSON.stringify({
        files: [
          { path: '../secret.md' },
          { path: 'C:/Windows/win.ini' },
          { path: 'missing.md' },
          { path: 'ch04/4.6-Galois扩张.md' }
        ],
        keywords: []
      }),
      allowed
    )
    expect(plan?.files).toEqual([{ path: 'ch04/4.6-Galois扩张.md' }])
  })

  it('caps files at five and keywords at eight', () => {
    const files = Array.from({ length: 8 }, (_, i) => allowed[i % allowed.length]!)
    const plan = parseRetrievalPlan(
      JSON.stringify({ files, keywords: Array.from({ length: 12 }, (_, i) => `k${i}`) }),
      allowed
    )
    expect(plan?.files).toHaveLength(3)
    expect(plan?.keywords).toHaveLength(8)
  })

  it('returns a keywords-only plan and rejects empty JSON', () => {
    expect(
      parseRetrievalPlan(JSON.stringify({ files: [], keywords: ['正规子群'] }), allowed)
    ).toEqual({ files: [], keywords: ['正规子群'] })
    expect(parseRetrievalPlan('{"files":[],"keywords":[]}', allowed)).toBeNull()
    expect(parseRetrievalPlan('not json', allowed)).toBeNull()
  })
})

describe('buildPlannerPrompt', () => {
  it('includes the catalog, current document and selection', () => {
    const prompt = buildPlannerPrompt({
      workspaceName: '抽象代数',
      catalog: 'ch01/1.10-Sylow定理.md\n  · 1.10 Sylow 定理',
      question: 'Sylow 定理怎么证明',
      selection: '选中的一句话',
      currentPath: 'ch01/1.1-群.md'
    })
    expect(prompt).toContain('【工作区】抽象代数')
    expect(prompt).toContain('【当前文档】ch01/1.1-群.md')
    expect(prompt).toContain('Sylow 定理怎么证明')
    expect(prompt).toContain('选中的一句话')
    expect(prompt).toContain('ch01/1.10-Sylow定理.md')
  })

  it('documents that the planner must only return JSON', () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain('JSON')
    expect(PLANNER_SYSTEM_PROMPT).toContain('最多选 5 个文件')
  })
})
