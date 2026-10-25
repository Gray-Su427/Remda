const BOM = '\uFEFF'
const OPENING_RULE = /^---[ \t]*\r?\n/
const CLOSING_RULE = /^---[ \t]*$/
const KEY_LINE = /^[A-Za-z0-9_.-]+:/

/**
 * 去掉文档开头的 YAML frontmatter。
 * 只在「首行是 ---、块内至少有一个 key: 行、且能遇到闭合的 ---」时剥离，
 * 以免把正文开头的分隔线误判成 frontmatter。
 */
export function stripFrontmatter(md: string): string {
  const text = md.startsWith(BOM) ? md.slice(1) : md
  const opening = OPENING_RULE.exec(text)
  if (!opening) return md

  const lines = text.slice(opening[0].length).split('\n')
  let hasKeyLine = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').replace(/\r$/, '')
    if (CLOSING_RULE.test(line)) {
      if (!hasKeyLine) return md
      const rest = lines.slice(index + 1).join('\n')
      return rest.replace(/^\r?\n/, '')
    }
    if (KEY_LINE.test(line)) hasKeyLine = true
  }

  return md
}
