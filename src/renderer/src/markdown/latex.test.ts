import { describe, expect, it } from 'vitest'
import { normalizeLatexDelimiters } from './latex'

describe('normalizeLatexDelimiters', () => {
  it('converts inline and display latex delimiters', () => {
    const input = '域 \\(F[x]\\) 与\n\n\\[\n\\ker\\varphi=\\langle f_\\alpha(x)\\rangle\n\\]\n'
    const output = normalizeLatexDelimiters(input)
    expect(output).toContain('$F[x]$')
    expect(output).toContain('$$\n\\ker\\varphi=\\langle f_\\alpha(x)\\rangle\n$$')
  })

  it('converts multiple inline formulas', () => {
    expect(normalizeLatexDelimiters('\\(a\\) 和 \\(b+c\\)')).toBe('$a$ 和 $b+c$')
  })

  it('leaves fenced code blocks untouched', () => {
    const input = '```text\n\\(x\\)\n\\[y\\]\n```'
    expect(normalizeLatexDelimiters(input)).toBe(input)
  })

  it('leaves inline code untouched', () => {
    expect(normalizeLatexDelimiters('写法 `\\(x\\)` 保持原样')).toBe('写法 `\\(x\\)` 保持原样')
  })

  it('leaves existing dollar math untouched', () => {
    expect(normalizeLatexDelimiters('已有 $a+b$，后面 \\(c\\)')).toBe('已有 $a+b$，后面 $c$')
    expect(normalizeLatexDelimiters('已有 $$a+b$$，不处理 \\(c\\)')).toBe(
      '已有 $$a+b$$，不处理 $c$'
    )
  })

  it('keeps escaped double backslashes literal', () => {
    expect(normalizeLatexDelimiters('字面量 \\\\(x\\\\)')).toBe('字面量 \\\\(x\\\\)')
  })

  it('leaves unmatched delimiters unchanged', () => {
    expect(normalizeLatexDelimiters('没有闭合 \\(x')).toBe('没有闭合 \\(x')
    expect(normalizeLatexDelimiters('没有闭合 \\[x')).toBe('没有闭合 \\[x')
  })

  it('does not convert inline formulas containing newlines', () => {
    const input = '\\(a\nb\\)'
    expect(normalizeLatexDelimiters(input)).toBe(input)
  })

  it('keeps display math aligned with its list indentation', () => {
    const input = '- item\n  \\[\n  \\ker\\varphi\n  \\]\n  after \\(x\\)'
    expect(normalizeLatexDelimiters(input)).toBe(
      '- item\n  $$\n  \\ker\\varphi\n  $$\n  after $x$'
    )
  })
})
