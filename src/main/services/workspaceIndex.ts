import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { AppError } from '@shared/errors'
import {
  buildRetrievalBlock,
  type RetrievalChunk,
  type RetrievalResult
} from '@shared/chat/retrieval'
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

  clear(root?: string): void {
    if (root) this.catalogs.delete(root)
    else this.catalogs.clear()
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
