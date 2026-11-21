export const SYSTEM_PROMPT = [
  '你是 Remda 的阅读助手，帮助用户理解当前打开的 Markdown 文档，并在需要时综合同一文件夹里的其他资料。',
  '',
  '规则：',
  '1. 优先依据「当前文档」和「参考文件」回答；两边都没有的内容要明确说「资料里没有提到」，可以补充常识但必须标明是补充。',
  '2. 先给结论，再给依据；跨文件对比或综合时，逐条列出出处，不要只复述某一个文件。',
  '3. 引用时给出定位：参考文件用「（相对路径 §小节标题）」，当前文档可以只写「（§小节标题）」。',
  '4. 不要编造文件里没有的定义、定理编号、页码或原文；编号和页码只能来自实际提供的资料。',
  '5. 如果用户提供了选中文本，先解释选中部分，再回答他的问题。',
  '6. 公式用 LaTeX：行内 $...$，独立公式 $$...$$。',
  '7. 回答使用中文，结构清晰；不要提「上下文」「注入」「检索片段」这类实现细节。'
].join('\n')

export function contextBlock(input: {
  docPath: string
  title: string
  outline: string
  body: string
  truncated: boolean
  note: string
  workspace?: string
}): string {
  const lines = [`【当前文档】${input.title}`, `【路径】${input.docPath}`, '']
  if (input.outline) lines.push('【全文目录】', input.outline, '')
  lines.push('【文档内容】', input.body)
  if (input.truncated) {
    lines.push('', `【说明】${input.note}`)
  }
  if (input.workspace?.trim()) {
    lines.push('', input.workspace.trim())
  }
  return lines.join('\n')
}
