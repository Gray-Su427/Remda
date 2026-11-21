export interface RetrievalChunk {
  /** 相对工作区的路径，统一使用 / 分隔 */
  path: string
  heading: string
  text: string
}

export interface RetrievalSource {
  path: string
  heading: string
}

export interface RetrievedChunk extends RetrievalChunk {
  score: number
}

export interface WorkspaceCorpus {
  name: string
  /** 工作区里所有可检索 Markdown 的相对路径 */
  paths: string[]
  chunks: RetrievalChunk[]
  /** 实际扫描到的文件数（可能大于 chunks 覆盖的文件数） */
  scanned: number
  /** 是否因为数量或体积上限跳过了文件 */
  truncated: boolean
}

export interface RetrievalOptions {
  query: string
  selection?: string
  /** 当前打开的文档，已在上下文中单独提供，不再重复检索 */
  currentPath?: string
  /** 检索区块可用的字符预算 */
  budget: number
}

export interface RetrievalResult {
  block: string
  sources: RetrievalSource[]
  scanned: number
  truncated: boolean
}

const MAX_CHUNKS = 6
const MAX_PER_FILE = 2
const MAX_CHUNK_CHARS = 5000
const MAX_TREE_CHARS = 3000
const MIN_SCORE = 0.3

const STOPWORDS = new Set([
  '的',
  '了',
  '是',
  '吗',
  '呢',
  '啊',
  '吧',
  '和',
  '与',
  '及',
  '或',
  '在',
  '中',
  '有',
  '无',
  '我',
  '你',
  '他',
  '她',
  '它',
  '这',
  '那',
  '请',
  '帮',
  '问',
  '说',
  '讲',
  '什么',
  '怎么',
  '如何',
  '为何',
  '为什',
  '这个',
  '那个',
  '这些',
  '那些',
  '一下',
  '帮我',
  '请问',
  '书中',
  '书上',
  '里面',
  '里的',
  '是否',
  '可以',
  '需要',
  '问题',
  '回答',
  '解释',
  '意思',
  '内容',
  '关于',
  '以及',
  '还有',
  '就是',
  '不是',
  '有没',
  '没有',
  '哪些',
  '哪个',
  '多少',
  '怎样',
  '么样',
  '么回',
  '么解',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'how',
  'what',
  'why',
  'please',
  'explain',
  'about',
  'with'
])

const HAN = /\p{Script=Han}+/gu
const WORD = /[a-z0-9]+(?:[._-][a-z0-9]+)*/g
const NUMBERED_REF = /^\d+(?:[._-]\d+)*$/
const INDEX_FILE = /(^|[-_.])(readme|index|toc|contents|map|目录|索引|导航|映射)([-_.]|$)/i

const countOccurrences = (text: string, needle: string): number => {
  if (!needle) return 0
  let count = 0
  let index = text.indexOf(needle)
  while (index !== -1 && count < 8) {
    count += 1
    index = text.indexOf(needle, index + needle.length)
  }
  return count
}

const addToken = (tokens: string[], token: string): void => {
  if (!token || STOPWORDS.has(token)) return
  tokens.push(token)
}

/** 中文按二元组 + 完整短语切分，英文/数字按词切分；过滤提问里的常见停用词。 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []

  for (const match of lower.matchAll(WORD)) {
    const token = match[0]
    if (token.length > 1 || /\d/.test(token)) addToken(tokens, token)
  }

  for (const match of lower.matchAll(HAN)) {
    const run = match[0]
    if (run.length === 1) {
      addToken(tokens, run)
      continue
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      addToken(tokens, run.slice(i, i + 2))
    }
    if (run.length <= 8) addToken(tokens, run)
  }

  return [...new Set(tokens)]
}

const basename = (path: string): string => path.split('/').pop() ?? path

/** 把相对路径压缩成「目录 / 文件名」的目录表，超出预算时截断。 */
export function formatWorkspaceTree(
  paths: string[],
  maxChars = MAX_TREE_CHARS
): { text: string; truncated: boolean } {
  const normalized = [...new Set(paths.map((path) => path.replace(/\\/g, '/')))].sort((a, b) =>
    a.localeCompare(b, 'zh-Hans-CN')
  )
  const groups = new Map<string, string[]>()
  for (const path of normalized) {
    const index = path.lastIndexOf('/')
    const dir = index === -1 ? '' : path.slice(0, index)
    const file = index === -1 ? path : path.slice(index + 1)
    const list = groups.get(dir) ?? []
    list.push(file)
    groups.set(dir, list)
  }

  const lines: string[] = []
  let omitted = 0
  let used = 0
  const dirs = [...groups.keys()].sort((a, b) => {
    if (a === '') return -1
    if (b === '') return 1
    return a.localeCompare(b, 'zh-Hans-CN')
  })

  for (const dir of dirs) {
    const files = groups.get(dir) ?? []
    if (dir) {
      if (used + dir.length + 2 > maxChars) {
        omitted += files.length
        continue
      }
      lines.push(`${dir}/`)
      used += dir.length + 2
    }
    for (const file of files) {
      const line = `  ${file}`
      if (used + line.length + 1 > maxChars) {
        omitted += 1
        continue
      }
      lines.push(line)
      used += line.length + 1
    }
  }

  if (omitted > 0) lines.push(`…（还有 ${omitted} 个文件未列出）`)
  return { text: lines.join('\n'), truncated: omitted > 0 }
}

/** 对候选小节打分；IDF 抑制在整库都出现的常见词，文件名校验编号直接命中。 */
export function rankChunks(
  chunks: RetrievalChunk[],
  tokens: string[],
  currentPath?: string
): RetrievedChunk[] {
  if (chunks.length === 0 || tokens.length === 0) return []
  const n = chunks.length
  const df = new Map<string, number>()
  for (const token of tokens) {
    let count = 0
    for (const chunk of chunks) {
      const haystack = `${chunk.path}\n${chunk.heading}\n${chunk.text}`.toLowerCase()
      if (haystack.includes(token)) count += 1
    }
    df.set(token, count)
  }

  const scored: RetrievedChunk[] = []
  for (const chunk of chunks) {
    if (currentPath && chunk.path === currentPath) continue
    const path = chunk.path.toLowerCase()
    const heading = chunk.heading.toLowerCase()
    const text = chunk.text.toLowerCase()
    let score = 0

    for (const token of tokens) {
      const inPath = path.includes(token)
      const inHeading = heading.includes(token)
      const count = countOccurrences(text, token)
      if (!inPath && !inHeading && count === 0) continue
      const idf = Math.log(1 + n / ((df.get(token) ?? 0) + 1))
      const weighted = NUMBERED_REF.test(token) ? 2.5 : 1
      if (inPath) score += 5 * idf * weighted
      if (inHeading) score += 6 * idf * weighted
      if (count > 0) score += (1 + Math.log2(count)) * idf * weighted
    }

    if (score === 0) continue
    if (INDEX_FILE.test(basename(chunk.path))) score += 2
    score /= Math.sqrt(1 + chunk.text.length / 4000)
    if (score >= MIN_SCORE) scored.push({ ...chunk, score })
  }

  return scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
}

function selectWithinBudget(
  ranked: RetrievedChunk[],
  budget: number
): { selected: RetrievedChunk[]; truncated: boolean } {
  const selected: RetrievedChunk[] = []
  const perFile = new Map<string, number>()
  let used = 0
  let truncated = false

  for (const chunk of ranked) {
    if (selected.length >= MAX_CHUNKS) {
      truncated = true
      break
    }
    if ((perFile.get(chunk.path) ?? 0) >= MAX_PER_FILE) continue

    const header = `── ${chunk.path}${chunk.heading ? ` §${chunk.heading}` : ''} ──\n`
    const remaining = budget - used - header.length
    if (remaining < 200) {
      truncated = true
      break
    }
    const text = chunk.text.length > Math.min(MAX_CHUNK_CHARS, remaining)
      ? chunk.text.slice(0, Math.min(MAX_CHUNK_CHARS, remaining))
      : chunk.text
    if (text.trim().length === 0) continue

    selected.push({ ...chunk, text })
    perFile.set(chunk.path, (perFile.get(chunk.path) ?? 0) + 1)
    used += header.length + text.length
    if (chunk.text.length > text.length) truncated = true
  }

  return { selected, truncated }
}

/**
 * 把工作区目录、命中小节和出处拼成一段可直接注入上下文的文本。
 * 这里不读文件，只处理已经准备好的语料，便于单测。
 */
export function buildRetrievalBlock(
  corpus: WorkspaceCorpus,
  options: RetrievalOptions
): RetrievalResult {
  const budget = Math.max(1000, Math.floor(options.budget))
  const treeBudget = Math.min(MAX_TREE_CHARS, Math.max(300, Math.floor(budget * 0.25)))
  const tree = formatWorkspaceTree(corpus.paths, treeBudget)
  const query = options.query.trim()
  const selection = options.selection?.trim().slice(0, 800) ?? ''
  const tokens = tokenize(`${query}\n${selection}`)
  const ranked = rankChunks(corpus.chunks, tokens, options.currentPath)
  const headerNote = `【工作区】${corpus.name}\n【文件目录】\n${tree.text}\n【参考文件】\n`
  const chunkBudget = Math.max(0, budget - headerNote.length)
  const { selected, truncated } = selectWithinBudget(ranked, chunkBudget)
  const isTruncated = truncated || tree.truncated || corpus.truncated
  const limitNote = isTruncated ? '（部分文件或片段因预算限制未展示）\n' : ''

  const body =
    selected.length > 0
      ? selected
          .map(
            (chunk) =>
              `── ${chunk.path}${chunk.heading ? ` §${chunk.heading}` : ''} ──\n${chunk.text.trim()}`
          )
          .join('\n\n')
      : '没有找到与当前问题直接相关的小节；如果当前文档也没有相关内容，请明确说明。'

  const block = `${headerNote}${limitNote}${body}`
  return {
    block,
    sources: selected.map((chunk) => ({ path: chunk.path, heading: chunk.heading })),
    scanned: corpus.scanned,
    truncated: isTruncated
  }
}
