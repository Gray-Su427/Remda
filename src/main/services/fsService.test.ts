/** @vitest-environment node */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isMarkdown, readDocument, readTree } from './fsService'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'remda-fs-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('isMarkdown', () => {
  it('accepts md/markdown/mdx case-insensitively', () => {
    expect(isMarkdown('a.md')).toBe(true)
    expect(isMarkdown('a.MARKDOWN')).toBe(true)
    expect(isMarkdown('a.txt')).toBe(false)
  })
})

describe('readTree', () => {
  it('returns dirs first, then md files, skipping dotfiles and node_modules', async () => {
    await mkdir(join(root, 'ch01'))
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'ch01', '1.1.md'), '# 1.1')
    await writeFile(join(root, 'README.md'), '# hi')
    await writeFile(join(root, 'notes.txt'), 'x')
    await writeFile(join(root, '.hidden.md'), '# h')

    const tree = await readTree(root)
    expect(tree.kind).toBe('dir')
    if (tree.kind !== 'dir') throw new Error('unreachable')
    expect(tree.children.map((c) => c.name)).toEqual(['ch01', 'README.md'])
    const chapter = tree.children[0]
    if (chapter?.kind !== 'dir') throw new Error('expected dir')
    expect(chapter.children[0]?.name).toBe('1.1.md')
  })

  it('rejects a file path', async () => {
    const file = join(root, 'a.md')
    await writeFile(file, '# a')
    await expect(readTree(file)).rejects.toMatchObject({ code: 'FS_NOT_DIRECTORY' })
  })
})

describe('readDocument', () => {
  it('reads content and metadata', async () => {
    const file = join(root, 'a.md')
    await writeFile(file, '# 标题\n')
    const doc = await readDocument(file)
    expect(doc.content).toBe('# 标题\n')
    expect(doc.name).toBe('a.md')
    expect(doc.size).toBeGreaterThan(0)
  })

  it('rejects non-markdown and missing files', async () => {
    const txt = join(root, 'a.txt')
    await writeFile(txt, 'x')
    await expect(readDocument(txt)).rejects.toMatchObject({ code: 'FS_NOT_MARKDOWN' })
    await expect(readDocument(join(root, 'nope.md'))).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
  })

  it('rejects files above 5MB', async () => {
    const big = join(root, 'big.md')
    await writeFile(big, '# big\n' + 'x'.repeat(5 * 1024 * 1024))
    await expect(readDocument(big)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
  })
})
