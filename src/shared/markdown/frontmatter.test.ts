/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { stripFrontmatter } from './frontmatter'

const doc = ['---', 'chapter: 1', 'section: "1.3"', 'title: 正规子群', '---', '', '# 1.3 正规子群', '', '正文'].join(
  '\n'
)

describe('stripFrontmatter', () => {
  it('removes a leading yaml frontmatter block', () => {
    expect(stripFrontmatter(doc)).toBe('# 1.3 正规子群\n\n正文')
  })

  it('leaves a document without frontmatter untouched', () => {
    const plain = '# 标题\n\n正文'
    expect(stripFrontmatter(plain)).toBe(plain)
  })

  it('does not strip a thematic break in the middle of the document', () => {
    const md = '# 标题\n\n正文\n\n---\n\n更多正文'
    expect(stripFrontmatter(md)).toBe(md)
  })

  it('handles CRLF line endings and a leading BOM', () => {
    const crlf = '\uFEFF---\r\nchapter: 1\r\n---\r\n\r\n# 标题\r\n'
    expect(stripFrontmatter(crlf)).toBe('# 标题\r\n')
  })

  it('keeps a leading rule when the block holds no key/value line', () => {
    const md = '---\n只是分隔线\n---\n\n正文'
    expect(stripFrontmatter(md)).toBe(md)
  })
})
