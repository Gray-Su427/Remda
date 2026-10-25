export const SYSTEM_PROMPT = [
  '你是 Remda 的阅读助手，帮助用户理解他正在阅读的 Markdown 文档。',
  '',
  '规则：',
  '1. 优先依据「文档内容」回答；文档没写的内容要明确说「文档里没有提到」，可以补充常识但必须标明是补充。',
  '2. 引用文档时给出定位，格式为「（§小节标题）」，例如（§1.3 正规子群）。',
  '3. 如果用户提供了选中文本，先解释选中部分，再回答他的问题。',
  '4. 公式用 LaTeX：行内 $...$，独立公式 $$...$$。',
  '5. 回答使用中文，结构清晰，不提「上下文」「文档片段」这类实现细节。'
].join('\n')

export function contextBlock(input: {
  docPath: string
  title: string
  outline: string
  body: string
  truncated: boolean
  note: string
}): string {
  const lines = [`【当前文档】${input.title}`, `【路径】${input.docPath}`, '']
  if (input.outline) lines.push('【全文目录】', input.outline, '')
  lines.push('【文档内容】', input.body)
  if (input.truncated) {
    lines.push('', `【说明】${input.note}`)
  }
  return lines.join('\n')
}
