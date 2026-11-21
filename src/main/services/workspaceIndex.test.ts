/** @vitest-environment node */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceIndex, chunkMarkdown } from './workspaceIndex'

let root: string
let clock = 1000

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'remda-index-'))
  clock = 1000
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const create = async (relativePath: string, content: string): Promise<string> => {
  const path = join(root, relativePath)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content, 'utf8')
  return path
}

describe('chunkMarkdown', () => {
  it('splits sections, keeps headings and strips frontmatter', () => {
    const chunks = chunkMarkdown(
      '---\ntitle: 抽象代数\nbook_pages: 1\n---\n\n# 第一章 群\n\n引言。\n\n## 1.1 半群与群\n\n群的定义。\n'
    )
    expect(chunks.map((chunk) => chunk.heading)).toEqual(['第一章 群', '1.1 半群与群'])
    expect(chunks[0]?.text).toContain('引言。')
    expect(chunks[0]?.text).not.toContain('book_pages')
    expect(chunks[1]?.text).toContain('群的定义。')
  })

  it('handles crlf and documents without headings', () => {
    const chunks = chunkMarkdown('正文第一行\r\n正文第二行\r\n', '笔记')
    expect(chunks).toEqual([{ heading: '笔记', text: '正文第一行\n正文第二行' }])
  })

  it('skips empty content', () => {
    expect(chunkMarkdown('   \n\n')).toEqual([])
  })
})

describe('WorkspaceIndex', () => {
  it('finds sections across files and reports relative sources', async () => {
    await create('README.md', '# 目录\n\nSylow 定理见 1.10。\n')
    await create('ch01/1.10-Sylow定理.md', '# Sylow 定理\n\n第一定理的证明。\n')
    await create('ch02/2.1-环.md', '# 环\n\n环的定义。\n')

    const index = new WorkspaceIndex(() => clock)
    const result = await index.search({
      root,
      question: 'Sylow 定理怎么证明',
      budget: 6000
    })

    expect(result.scanned).toBe(3)
    expect(result.block).toContain('ch01/1.10-Sylow定理.md')
    expect(result.block).not.toContain(root)
    expect(result.sources.some((source) => source.path === 'ch01/1.10-Sylow定理.md')).toBe(true)
  })

  it('excludes the current document from retrieved sources', async () => {
    const doc = await create('ch01/1.10-Sylow定理.md', '# Sylow 定理\n\n第一定理的证明。\n')
    await create('ch02/1.11-习题.md', '# 习题\n\nSylow 定理习题。\n')

    const index = new WorkspaceIndex(() => clock)
    const result = await index.search({
      root,
      docPath: doc,
      question: 'Sylow 定理',
      budget: 6000
    })

    expect(result.sources.some((source) => source.path === 'ch01/1.10-Sylow定理.md')).toBe(false)
    expect(result.sources.some((source) => source.path === 'ch02/1.11-习题.md')).toBe(true)
  })

  it('skips hidden directories, node_modules and non-markdown files', async () => {
    await create('.hidden/secret.md', '# 隐藏\n\n秘密内容。\n')
    await create('node_modules/pkg/readme.md', '# 依赖\n\n秘密内容。\n')
    await create('notes.txt', '秘密内容。\n')
    await create('notes.md', '# 笔记\n\n秘密内容。\n')

    const index = new WorkspaceIndex(() => clock)
    const result = await index.search({ root, question: '秘密', budget: 6000 })

    expect(result.scanned).toBe(1)
    expect(result.sources).toEqual([{ path: 'notes.md', heading: '笔记' }])
    expect(result.block).not.toContain('.hidden')
    expect(result.block).not.toContain('node_modules')
  })

  it('reuses the catalog briefly and refreshes after the ttl', async () => {
    await create('notes.md', '# 笔记\n\n旧的内容。\n')
    const index = new WorkspaceIndex(() => clock)

    const first = await index.search({ root, question: '旧的内容', budget: 4000 })
    expect(first.sources).toHaveLength(1)

    await create('notes.md', '# 笔记\n\n新的内容，长度不同。\n')
    const cached = await index.search({ root, question: '新的内容', budget: 4000 })
    expect(cached.block).not.toContain('新的内容')

    clock += 4000
    const refreshed = await index.search({ root, question: '新的内容', budget: 4000 })
    expect(refreshed.block).toContain('新的内容')
  })

  it('marks the result truncated when the file cap is reached', async () => {
    await create('a.md', '# 甲\n\n共同关键词。\n')
    await create('b.md', '# 乙\n\n共同关键词。\n')
    const index = new WorkspaceIndex(() => clock, { maxFiles: 1 })

    const result = await index.search({ root, question: '共同关键词', budget: 4000 })
    expect(result.truncated).toBe(true)
    expect(result.block).toContain('未展示')
  })

  it('rejects missing paths and plain files', async () => {
    const index = new WorkspaceIndex(() => clock)
    await expect(
      index.search({ root: join(root, 'missing'), question: 'x', budget: 1000 })
    ).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })

    const file = await create('a.md', '# A\n')
    await expect(index.search({ root: file, question: 'x', budget: 1000 })).rejects.toMatchObject({
      code: 'FS_NOT_DIRECTORY'
    })
  })
})
