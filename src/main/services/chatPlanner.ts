import { normalizeRelativePath } from './workspaceIndex'

export interface PlannedFile {
  path: string
  heading?: string
}

export interface RetrievalPlan {
  files: PlannedFile[]
  keywords: string[]
}

export const PLANNER_SYSTEM_PROMPT = [
  '你是 Remda 的检索规划器。请根据用户的问题和下方工作区目录，挑出真正相关的 Markdown 文件和小节。',
  '',
  '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释：',
  '{"files":[{"path":"相对路径","heading":"可选小节标题"}],"keywords":["补充检索关键词"]}',
  '',
  '规则：',
  '1. path 必须逐字来自目录，使用 / 分隔，不能是绝对路径，不能包含 ..；',
  '2. 最多选 5 个文件；当前文档已经在最终上下文里，不要选它；',
  '3. 不确定具体小节时省略 heading；确定时标题要尽量与目录里的写法一致；',
  '4. keywords 最多 8 个，用于在选中文件之外补充检索；',
  '5. 没有相关文件时可以返回空 files，但仍给出关键词。'
].join('\n')

export interface PlannerPromptInput {
  workspaceName: string
  catalog: string
  question: string
  selection?: string
  currentPath?: string
  catalogTruncated?: boolean
}

/** 规划请求的 user 内容：工作区目录 + 当前文档 + 问题。 */
export function buildPlannerPrompt(input: PlannerPromptInput): string {
  const lines = [
    `【工作区】${input.workspaceName}`,
    `【当前文档】${input.currentPath ?? '无'}`,
    '',
    '【用户问题】',
    input.question
  ]
  if (input.selection?.trim()) {
    lines.push('', '【用户选中】', input.selection.trim().slice(0, 4000))
  }
  lines.push('', `【目录】${input.catalogTruncated ? '（部分文件未列出）' : ''}`, input.catalog)
  return lines.join('\n')
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/**
 * 从模型输出里提取并校验规划 JSON。
 * 返回 null 表示没有可用结果，由上层回退到本地检索。
 */
export function parseRetrievalPlan(text: string, allowedPaths: string[]): RetrievalPlan | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as { files?: unknown; keywords?: unknown }
  const allowed = new Set(allowedPaths.map((path) => normalizeRelativePath(path) ?? path))
  const files: PlannedFile[] = []

  if (Array.isArray(record.files)) {
    for (const item of record.files) {
      const raw = typeof item === 'string' ? { path: item } : (item as { path?: unknown; heading?: unknown })
      if (!raw || typeof raw !== 'object') continue
      const path = asString((raw as { path?: unknown }).path)
      if (!path) continue
      const normalized = normalizeRelativePath(path)
      if (!normalized || !allowed.has(normalized)) continue
      if (files.some((file) => file.path === normalized)) continue
      const heading = asString((raw as { heading?: unknown }).heading)
      files.push(heading ? { path: normalized, heading } : { path: normalized })
      if (files.length >= 5) break
    }
  }

  const keywords: string[] = []
  if (Array.isArray(record.keywords)) {
    for (const item of record.keywords) {
      const keyword = asString(item)
      if (!keyword || keyword.length > 60) continue
      if (!keywords.includes(keyword)) keywords.push(keyword)
      if (keywords.length >= 8) break
    }
  }

  if (files.length === 0 && keywords.length === 0) return null
  return { files, keywords }
}
