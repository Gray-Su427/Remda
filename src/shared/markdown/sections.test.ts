/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { documentTitle, extractSections, outlineText, sectionAt } from './sections'

const md = [
  '# 第一章',
  '引言文字',
  '## 1.1 群',
  '群的内容',
  '### 1.1.1 半群',
  '半群内容',
  '## 1.2 环',
  '环的内容'
].join('\n')

describe('extractSections', () => {
  it('returns every heading as a section with stable slug ids', () => {
    const sections = extractSections(md)
    expect(sections.map((s) => s.id)).toEqual(['第一章', '11-群', '111-半群', '12-环'])
    expect(sections.map((s) => s.depth)).toEqual([1, 2, 3, 2])
  })

  it('slices section source ranges up to the next heading of any level', () => {
    const first = extractSections(md)[0]
    expect(first?.start).toBe(0)
    expect(md.slice(first!.start, first!.end)).toContain('引言文字')
    expect(md.slice(first!.start, first!.end)).not.toContain('群的内容')
  })

  it('sectionAt returns undefined for unknown ids', () => {
    expect(sectionAt(md, 'nope')).toBeUndefined()
    expect(sectionAt(md, '11-群')?.title).toBe('1.1 群')
  })
})

describe('outlineText', () => {
  it('renders an indented list of headings', () => {
    expect(outlineText(md)).toBe(
      ['- 第一章', '  - 1.1 群', '    - 1.1.1 半群', '  - 1.2 环'].join('\n')
    )
  })

  it('returns an empty string when there are no headings', () => {
    expect(outlineText('just text')).toBe('')
  })
})

describe('documentTitle', () => {
  it('prefers the first h1', () => {
    expect(documentTitle(md, 'a.md')).toBe('第一章')
  })

  it('falls back to the file name', () => {
    expect(documentTitle('no heading', 'a.md')).toBe('a.md')
  })
})
