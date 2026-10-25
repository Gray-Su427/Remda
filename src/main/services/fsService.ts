import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { AppError } from '@shared/errors'
import type { DocumentPayload, FileChangeEvent, FileNode } from '@shared/types'
import { createDebouncer } from './debounce'

const MD_EXT = new Set(['.md', '.markdown', '.mdx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'release', '.git', '.vite'])
const MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_DEPTH = 8

export const isMarkdown = (p: string): boolean => MD_EXT.has(extname(p).toLowerCase())

export async function readTree(root: string, maxDepth = DEFAULT_DEPTH): Promise<FileNode> {
  const info = await stat(root).catch(() => null)
  if (!info) throw new AppError('FS_NOT_FOUND', `路径不存在：${root}`)
  if (!info.isDirectory()) throw new AppError('FS_NOT_DIRECTORY', `不是文件夹：${root}`)
  return { kind: 'dir', name: basename(root), path: root, children: await readChildren(root, 0, maxDepth) }
}

async function readChildren(dir: string, depth: number, maxDepth: number): Promise<FileNode[]> {
  if (depth >= maxDepth) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        kind: 'dir',
        name: entry.name,
        path: full,
        children: await readChildren(full, depth + 1, maxDepth)
      })
    } else if (isMarkdown(entry.name)) {
      const size = (await stat(full)).size
      nodes.push({ kind: 'file', name: entry.name, path: full, size })
    }
  }
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

export async function readDocument(path: string): Promise<DocumentPayload> {
  if (!isMarkdown(path)) throw new AppError('FS_NOT_MARKDOWN', `不是 Markdown 文件：${path}`)
  const info = await stat(path).catch(() => null)
  if (!info) throw new AppError('FS_NOT_FOUND', `文件不存在：${path}`)
  if (info.size > MAX_BYTES) throw new AppError('FS_TOO_LARGE', '文件超过 5MB，暂不支持打开')
  const content = await readFile(path, 'utf8')
  return { path, name: basename(path), content, mtimeMs: info.mtimeMs, size: info.size }
}

export function watchDocument(path: string, cb: (event: FileChangeEvent) => void): () => void {
  const watcher: FSWatcher = watch(path, { ignoreInitial: true })
  const emit = createDebouncer(200)
  watcher.on('change', () => emit(() => cb({ type: 'change', path })))
  watcher.on('unlink', () => emit(() => cb({ type: 'unlink', path })))
  return () => {
    void watcher.close()
  }
}
