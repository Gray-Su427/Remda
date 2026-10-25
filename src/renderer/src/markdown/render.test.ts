import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './render'

describe('renderMarkdown', () => {
  it('renders headings with github-slugger ids', async () => {
    const html = await renderMarkdown('# 1.1 群\n正文')
    expect(html).toContain('<h1 id="11-群">1.1 群</h1>')
  })

  it('renders inline and block math with katex', async () => {
    const html = await renderMarkdown('行内 $a^2+b^2$ 与\n\n$$\n\\frac{1}{2}\n$$\n')
    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display')
  })

  it('renders gfm tables and task lists', async () => {
    const html = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n')
    expect(html).toContain('<table>')
    expect(html).toContain('type="checkbox"')
  })

  it('does not pass raw html through', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('onerror')
  })

  it('turns a single newline inside a paragraph into a line break', async () => {
    const html = await renderMarkdown('第一行\n第二行')
    expect(html).toContain('<br>')
    expect(html).toContain('第一行<br>')
    expect(html).toContain('第二行')
  })

  it('still splits paragraphs on blank lines', async () => {
    const html = await renderMarkdown('第一段\n\n第二段')
    expect(html).toContain('<p>第一段</p>')
    expect(html).toContain('<p>第二段</p>')
  })

  it('keeps newlines inside fenced code blocks as-is', async () => {
    const html = await renderMarkdown('```\nconst a = 1\nconst b = 2\n```')
    expect(html).toContain('<pre>')
    expect(html).not.toContain('<br>')
  })

  it('does not break inline code', async () => {
    const html = await renderMarkdown('前 `` a\nb `` 后')
    expect(html).not.toContain('<br>')
  })

  it('leaves gfm table rows untouched', async () => {
    const html = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<tr>')
    expect(html).not.toContain('<br>')
  })

  it('breaks lines inside blockquotes too', async () => {
    const html = await renderMarkdown('> 第一行\n> 第二行')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<br>')
  })

  it('strips leading yaml frontmatter before rendering', async () => {
    const html = await renderMarkdown('---\nchapter: 1\ntitle: 群\n---\n\n# 1.1 群')
    expect(html).not.toContain('chapter')
    expect(html).toContain('<h1 id="11-群">1.1 群</h1>')
  })
})
