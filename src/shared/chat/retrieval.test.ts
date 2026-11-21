/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import {
  buildRetrievalBlock,
  formatWorkspaceTree,
  rankChunks,
  tokenize,
  type RetrievalChunk,
  type WorkspaceCorpus
} from './retrieval'

const chunk = (path: string, heading: string, text: string): RetrievalChunk => ({
  path,
  heading,
  text
})

describe('tokenize', () => {
  it('splits chinese into bigrams and keeps english words and numbers', () => {
    const tokens = tokenize('什么是正规子群？Sylow 定理 1.10.3')
    expect(tokens).toContain('正规')
    expect(tokens).toContain('规子')
    expect(tokens).toContain('子群')
    expect(tokens).toContain('sylow')
    expect(tokens).toContain('1.10.3')
  })

  it('drops common question words', () => {
    const tokens = tokenize('帮我解释一下这是什么意思')
    expect(tokens).not.toContain('帮我')
    expect(tokens).not.toContain('什么')
    expect(tokens).not.toContain('意思')
  })

  it('deduplicates repeated tokens', () => {
    const tokens = tokenize('Sylow sylow SYLOW')
    expect(tokens.filter((token) => token === 'sylow')).toHaveLength(1)
  })
})

describe('formatWorkspaceTree', () => {
  it('groups files by directory and puts root files first', () => {
    const tree = formatWorkspaceTree(['ch01/1.1.md', 'README.md', 'ch01/1.2.md', 'ch02/a.md'])
    expect(tree.text.split('\n')).toEqual([
      '  README.md',
      'ch01/',
      '  1.1.md',
      '  1.2.md',
      'ch02/',
      '  a.md'
    ])
    expect(tree.truncated).toBe(false)
  })

  it('truncates a large tree', () => {
    const paths = Array.from({ length: 50 }, (_, i) => `ch01/${i}.md`)
    const tree = formatWorkspaceTree(paths, 80)
    expect(tree.truncated).toBe(true)
    expect(tree.text).toContain('未列出')
  })
})

describe('rankChunks', () => {
  it('ranks heading matches ahead of body matches', () => {
    const chunks = [
      chunk('a.md', '群的定义', '这里顺便提到正规子群。'),
      chunk('b.md', '正规子群与商群', '正规子群的定义。')
    ]
    const ranked = rankChunks(chunks, tokenize('正规子群'))
    expect(ranked[0]?.path).toBe('b.md')
  })

  it('lifts index files that point at the topic', () => {
    const chunks = [
      chunk('ch01/1.1.md', '第一章', '无关内容。'),
      chunk('TOPIC-INDEX.md', '主题索引', 'Sylow 定理 → §1.10')
    ]
    const ranked = rankChunks(chunks, tokenize('Sylow 定理'))
    expect(ranked[0]?.path).toBe('TOPIC-INDEX.md')
  })

  it('treats theorem numbers as strong signals', () => {
    const chunks = [
      chunk('a.md', '普通小节', '这里只提到定理。'),
      chunk('b.md', 'Sylow 定理', '**定理 1.10.3** 的内容。')
    ]
    const ranked = rankChunks(chunks, tokenize('定理 1.10.3 怎么证明'))
    expect(ranked[0]?.path).toBe('b.md')
  })

  it('never returns the document already in context', () => {
    const chunks = [chunk('a.md', '正规子群', '正规子群的定义。')]
    expect(rankChunks(chunks, tokenize('正规子群'), 'a.md')).toEqual([])
  })

  it('returns nothing when no query token matches', () => {
    const chunks = [chunk('a.md', '群', '半群与群。')]
    expect(rankChunks(chunks, tokenize('完全无关的词汇'))).toEqual([])
  })
})

describe('buildRetrievalBlock', () => {
  const corpus: WorkspaceCorpus = {
    name: '抽象代数',
    paths: ['README.md', 'ch01/1.10-Sylow定理.md', 'ch02/2.1-环.md'],
    chunks: [
      chunk('ch01/1.10-Sylow定理.md', 'Sylow 定理', 'Sylow 第一定理的证明。'),
      chunk('ch02/2.1-环.md', '环的定义', '环的定义与基本性质。')
    ],
    scanned: 3,
    truncated: false
  }

  it('includes the workspace tree, relative paths and headings', () => {
    const result = buildRetrievalBlock(corpus, { query: 'Sylow 定理', budget: 5000 })
    expect(result.block).toContain('【工作区】抽象代数')
    expect(result.block).toContain('ch01/1.10-Sylow定理.md §Sylow 定理')
    expect(result.block).not.toContain('D:\\')
    expect(result.sources).toEqual([{ path: 'ch01/1.10-Sylow定理.md', heading: 'Sylow 定理' }])
  })

  it('says so when nothing matches', () => {
    const result = buildRetrievalBlock(corpus, { query: '完全无关的词汇', budget: 5000 })
    expect(result.block).toContain('没有找到')
    expect(result.sources).toEqual([])
  })

  it('respects the character budget', () => {
    const big: WorkspaceCorpus = {
      ...corpus,
      chunks: [
        chunk('ch01/a.md', 'A', '甲'.repeat(4000)),
        chunk('ch01/b.md', 'B', '乙'.repeat(4000)),
        chunk('ch01/c.md', 'C', '丙'.repeat(4000))
      ]
    }
    const result = buildRetrievalBlock(big, { query: '甲 乙 丙', budget: 2500 })
    expect(result.block.length).toBeLessThan(3000)
    expect(result.truncated).toBe(true)
  })

  it('limits each file to two sections', () => {
    const chunks = Array.from({ length: 5 }, (_, i) =>
      chunk('same.md', `第 ${i} 节`, `正规子群 第 ${i} 节。`)
    )
    const result = buildRetrievalBlock(
      { ...corpus, paths: ['same.md'], chunks },
      { query: '正规子群', budget: 5000 }
    )
    expect(result.sources).toHaveLength(2)
  })
})
