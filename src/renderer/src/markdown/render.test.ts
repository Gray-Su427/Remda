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
})
