import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { AppError } from '@shared/errors'
import {
  buildRetrievalBlock,
  rankChunks,
  tokenize,
  type RetrievalChunk,
  type RetrievalResult
} from '@shared/chat/retrieval'
import type { WorkspaceSource } from '@shared/types'
import { stripFrontmatter } from '@shared/markdown/frontmatter'
import { isMarkdown, SKIP_DIRS } from './fsService'

const DEFAULT_MAX_FILES = 1000
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_DEPTH = 12
const DEFAULT_CACHE_TTL_MS = 3000

const HEADING = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/

export interface MarkdownChunk {
  heading: string
  text: string
}

export interface WorkspaceIndexOptions {
  maxFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
  maxDepth?: number
  cacheTtlMs?: number
}

export interface WorkspaceSearchInput {
  root: string
  docPath?: string
  question: string
  selection?: string
  budget: number
}

export interface WorkspaceCatalogResult {
  text: string
  paths: string[]
  truncated: boolean
}

export interface WorkspaceSelection {
  path: string
  heading?: string
}

export interface WorkspaceReadOptions {
  budget: number
  currentDocPath?: string
  /** 规划器给出的补充关键词，用一次本地检索补漏 */
  keywords?: string[]
}

export interface WorkspaceExcerptResult {
  block: string
  sources: WorkspaceSource[]
  truncated: boolean
}

interface IndexedFile {
  absPath: string
  relPath: string
  mtimeMs: number
  size: number
  chunks: RetrievalChunk[]
}

interface Catalog {
  root: string
  files: Map<string, IndexedFile>
  scannedAt: number
  truncated: boolean
}

/** 按 Markdown 标题切成小节；frontmatter 不进入检索正文。 */
export function chunkMarkdown(markdown: string, fallbackHeading = ''): MarkdownChunk[] {
  const text = stripFrontmatter(markdown).replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const chunks: MarkdownChunk[] = []
  let heading = fallbackHeading
  let buffer: string[] = []

  const flush = (): void => {
    const body = buffer.join('\n').trim()
    if (body) chunks.push({ heading, text: body })
    buffer = []
  }

  for (const line of lines) {
    const match = HEADING.exec(line)
    if (match) {
      flush()
      heading = match[2]!.trim()
      buffer = [line]
      continue
    }
    buffer.push(line)
  }
  flush()

  return chunks
}

const toPosix = (value: string): string => value.replace(/\\/g, '/')

const fileHeading = (name: string): string => name.slice(0, name.length - extname(name).length)

export const normalizeRelativePath = (value: string): string | null => {
  const rel = toPosix(value.trim()).replace(/^\.\//, '')
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null
  const parts = rel.split('/')
  if (parts.some((part) => part === '' || part === '..' || part === '.')) return null
  return parts.join('/')
}

const normalizeHeading = (value: string): string =>
  value.replace(/^§/, '').replace(/\s+/g, ' ').trim().toLowerCase()

export class WorkspaceIndex {
  private readonly maxFiles: number
  private readonly maxFileBytes: number
  private readonly maxTotalBytes: number
  private readonly maxDepth: number
  private readonly cacheTtlMs: number
  private readonly catalogs = new Map<string, Catalog>()

  constructor(
    private readonly now: () => number = Date.now,
    options: WorkspaceIndexOptions = {}
  ) {
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  }

  async search(input: WorkspaceSearchInput): Promise<RetrievalResult> {
    const catalog = await this.loadCatalog(input.root)
    const currentPath = this.currentRelativePath(catalog.root, input.docPath)
    return buildRetrievalBlock(
      {
        name: basename(catalog.root),
        paths: [...catalog.files.values()].map((file) => file.relPath),
        chunks: [...catalog.files.values()].flatMap((file) => file.chunks),
        scanned: catalog.files.size,
        truncated: catalog.truncated
      },
      {
        query: input.question,
        selection: input.selection,
        currentPath,
        budget: input.budget
      }
    )
  }

  /** 给规划器看的紧凑目录：相对路径 + 每篇最多 6 个标题。 */
  async catalog(root: string, maxChars = 12000): Promise<WorkspaceCatalogResult> {
    const catalog = await this.loadCatalog(root)
    const files = [...catalog.files.values()].sort((a, b) =>
      a.relPath.localeCompare(b.relPath, 'zh-Hans-CN')
    )
    const lines: string[] = []
    let used = 0
    let omitted = 0

    for (const file of files) {
      const headings = [
        ...new Set(
          file.chunks
            .map((chunk) => chunk.heading)
            .filter((heading) => heading && heading !== fileHeading(basename(file.relPath)))
        )
      ].slice(0, 6)
      const entry = [file.relPath, ...headings.map((heading) => `  · ${heading}`)]
      const size = entry.join('\n').length + 1
      if (used + size > maxChars) {
        omitted += 1
        continue
      }
      lines.push(...entry)
      used += size
    }

    if (omitted > 0) lines.push(`…（还有 ${omitted} 篇未列出）`)
    return {
      text: lines.join('\n'),
      paths: files.map((file) => file.relPath),
      truncated: catalog.truncated || omitted > 0
    }
  }

  /**
   * 读取 AI 选中的文件/小节；再按关键词补一轮本地检索，避免只靠文件名漏掉内容。
   */
  async readSelections(
    root: string,
    selections: WorkspaceSelection[],
    options: WorkspaceReadOptions
  ): Promise<WorkspaceExcerptResult> {
    const catalog = await this.loadCatalog(root)
    const currentPath = this.currentRelativePath(catalog.root, options.currentDocPath)
    const byPath = new Map([...catalog.files.values()].map((file) => [file.relPath, file]))
    const picked: RetrievalChunk[] = []
    const seen = new Set<string>()

    const push = (chunk: RetrievalChunk): void => {
      if (picked.length >= 8) return
      if (chunk.path === currentPath) return
      const key = `${chunk.path}\u0000${chunk.heading}`
      if (seen.has(key)) return
      seen.add(key)
      picked.push(chunk)
    }

    for (const selection of selections.slice(0, 5)) {
      const relPath = normalizeRelativePath(selection.path)
      if (!relPath) continue
      const file = byPath.get(relPath)
      if (!file) continue
      let chunks = file.chunks
      if (selection.heading?.trim()) {
        const target = normalizeHeading(selection.heading)
        const matched = chunks.filter((chunk) => {
          const heading = normalizeHeading(chunk.heading)
          return heading === target || heading.includes(target) || target.includes(heading)
        })
        if (matched.length > 0) chunks = matched
      }
      for (const chunk of chunks.slice(0, selection.heading?.trim() ? 1 : 2)) push(chunk)
    }

    if (options.keywords && options.keywords.length > 0) {
      const tokens = tokenize(options.keywords.join(' '))
      if (tokens.length > 0) {
        const allChunks = [...catalog.files.values()].flatMap((file) => file.chunks)
        for (const chunk of rankChunks(allChunks, tokens, currentPath).slice(0, 3)) push(chunk)
      }
    }

    const budget = Math.max(1000, Math.floor(options.budget))
    const lines = ['【参考文件】']
    const sources: WorkspaceSource[] = []
    let used = lines[0]!.length
    let truncated = catalog.truncated

    for (const chunk of picked) {
      const header = `── ${chunk.path}${chunk.heading ? ` §${chunk.heading}` : ''} ──`
      const remaining = budget - used - header.length - 2
      if (remaining < 200) {
        truncated = true
        break
      }
      const max = Math.min(4000, remaining)
      const text = chunk.text.length > max ? chunk.text.slice(0, max) : chunk.text
      if (chunk.text.length > text.length) truncated = true
      lines.push(header, text.trim())
      used += header.length + text.length + 2
      sources.push({ path: chunk.path, heading: chunk.heading })
    }

    if (sources.length === 0) return { block: '', sources: [], truncated }
    return { block: lines.join('\n'), sources, truncated }
  }

  clear(root?: string): void {
    if (root) this.catalogs.delete(root)
    else this.catalogs.clear()
  }

  /** 把绝对文档路径换成相对工作区路径；不在工作区内时返回 undefined。 */
  async relativeDocPath(root: string, docPath?: string): Promise<string | undefined> {
    if (!docPath) return undefined
    const catalog = await this.loadCatalog(root)
    return this.currentRelativePath(catalog.root, docPath)
  }

  private currentRelativePath(root: string, docPath?: string): string | undefined {
    if (!docPath) return undefined
    const rel = toPosix(relative(root, docPath))
    return rel.startsWith('..') || rel === '' ? undefined : rel
  }

  /** 3 秒内复用目录扫描结果；文件内容按 mtime + size 复用。 */
  private async loadCatalog(root: string): Promise<Catalog> {
    const cached = this.catalogs.get(root)
    const now = this.now()
    if (cached && now - cached.scannedAt <= this.cacheTtlMs) return cached

    const resolved = await realpath(root).catch(() => null)
    if (!resolved) throw new AppError('FS_NOT_FOUND', `路径不存在：${root}`)
    const info = await stat(resolved).catch(() => null)
    if (!info) throw new AppError('FS_NOT_FOUND', `路径不存在：${root}`)
    if (!info.isDirectory()) throw new AppError('FS_NOT_DIRECTORY', `不是文件夹：${root}`)

    const previous = cached?.files ?? new Map<string, IndexedFile>()
    const files = new Map<string, IndexedFile>()
    let truncated = false
    let totalBytes = 0

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > this.maxDepth || files.size >= this.maxFiles) {
        truncated = true
        return
      }
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (files.size >= this.maxFiles) {
          truncated = true
          break
        }
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        if (entry.isSymbolicLink()) continue
        const absPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(absPath, depth + 1)
          continue
        }
        if (!entry.isFile() || !isMarkdown(entry.name)) continue

        const fileInfo = await stat(absPath).catch(() => null)
        if (!fileInfo || !fileInfo.isFile()) continue
        if (fileInfo.size > this.maxFileBytes) {
          truncated = true
          continue
        }
        if (totalBytes + fileInfo.size > this.maxTotalBytes) {
          truncated = true
          continue
        }
        totalBytes += fileInfo.size

        const relPath = toPosix(relative(resolved, absPath))
        const old = previous.get(absPath)
        if (old && old.mtimeMs === fileInfo.mtimeMs && old.size === fileInfo.size) {
          files.set(absPath, old)
          continue
        }
        const content = await readFile(absPath, 'utf8').catch(() => null)
        if (content === null) {
          truncated = true
          continue
        }
        const heading = fileHeading(entry.name)
        files.set(absPath, {
          absPath,
          relPath,
          mtimeMs: fileInfo.mtimeMs,
          size: fileInfo.size,
          chunks: chunkMarkdown(content, heading).map((chunk) => ({
            path: relPath,
            heading: chunk.heading,
            text: chunk.text
          }))
        })
      }
    }

    await walk(resolved, 0)
    const catalog: Catalog = { root: resolved, files, scannedAt: now, truncated }
    this.catalogs.set(root, catalog)
    return catalog
  }
}
