export interface ImageOptions {
  /** 当前 Markdown 文件所在目录（绝对路径） */
  baseDir?: string
  /** 已打开工作区的根目录 */
  rootDir?: string
}

export interface ResolvedImage {
  src: string
  /** 网络图片的原始地址；失败时用于「在浏览器打开」 */
  originalSrc?: string
}

const toPosix = (value: string): string => value.replace(/\\/g, '/')
const WINDOWS_DRIVE = /^[A-Za-z]:\//
const ANY_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

/** 只处理 `/` 与 `\` 两种分隔符，不依赖 Node 的 path 模块。 */
export function dirname(value: string): string {
  const posix = toPosix(value).replace(/\/+$/, '')
  const index = posix.lastIndexOf('/')
  if (index < 0) return ''
  if (index === 0) return '/'
  if (/^[A-Za-z]:$/.test(posix.slice(0, index))) return `${posix.slice(0, index)}/`
  return posix.slice(0, index)
}

/** 规范化绝对路径；`..` 越过根目录时返回 null。 */
export function normalizePath(value: string): string | null {
  const posix = toPosix(value)
  const drive = posix.match(/^([A-Za-z]):\//)?.[1] ?? null
  const absolute = drive !== null || posix.startsWith('/')
  const body = drive !== null ? posix.slice(2) : posix
  const segments: string[] = []

  for (const segment of body.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  if (drive) return `${drive}:/${segments.join('/')}`
  if (absolute) return `/${segments.join('/')}`
  return segments.join('/')
}

export function isPathInside(root: string, path: string): boolean {
  const normalizedRoot = normalizePath(root)
  const normalizedPath = normalizePath(path)
  if (!normalizedRoot || !normalizedPath) return false

  const fold = (value: string): string =>
    WINDOWS_DRIVE.test(value) ? value.toLowerCase() : value
  const base = fold(normalizedRoot).replace(/\/+$/, '')
  const target = fold(normalizedPath)
  return target === base || target.startsWith(`${base}/`)
}

function resolveLocalPath(raw: string, options: ImageOptions): string | null {
  const posix = toPosix(raw)
  if (WINDOWS_DRIVE.test(posix)) return normalizePath(posix)

  if (posix.startsWith('/')) {
    const root = options.rootDir
    if (root) return normalizePath(`${toPosix(root).replace(/\/+$/, '')}/${posix.slice(1)}`)
    const drive = toPosix(options.baseDir ?? '').match(/^([A-Za-z]):\//)?.[1]
    return drive ? normalizePath(`${drive}:/${posix.slice(1)}`) : normalizePath(posix)
  }

  if (!options.baseDir) return null
  return normalizePath(`${toPosix(options.baseDir).replace(/\/+$/, '')}/${posix}`)
}

const hexEncode = (value: string): string =>
  Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')

const proxyRemote = (url: string): string => `remda-img://remote/?url=${encodeURIComponent(url)}`

const proxyLocal = (path: string): string => `remda-img://local/?path=${hexEncode(path)}`

/**
 * 把 Markdown 图片地址转换成 <img> 可加载的形式：
 * - http 走主进程代理，绕开 CSP 与 file:// 混合内容限制
 * - https / data: 保持直连
 * - 相对路径按当前文档目录解析，交给 remda-img://local
 */
export function normalizeImageSource(value: string, options: ImageOptions = {}): ResolvedImage | null {
  const raw = value.trim()
  if (!raw) return null

  if (/^data:image\//i.test(raw)) return { src: raw }
  if (/^https:\/\//i.test(raw)) return { src: raw, originalSrc: raw }
  if (/^http:\/\//i.test(raw)) return { src: proxyRemote(raw), originalSrc: raw }
  if (raw.startsWith('//')) {
    const https = `https:${raw}`
    return { src: https, originalSrc: https }
  }
  // file: / javascript: / blob: 等一律拒绝；Windows 盘符不是 URL scheme
  if (ANY_SCHEME.test(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) return null

  const absolute = resolveLocalPath(raw, options)
  if (!absolute) {
    // 没有文档目录时保留原样，避免把编辑器里的相对图片直接吞掉
    return options.baseDir ? null : { src: raw }
  }
  return { src: proxyLocal(absolute) }
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function rewriteImages(node: HastNode, options: ImageOptions): void {
  if (!Array.isArray(node.children)) return

  const kept: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'element' && child.tagName === 'img') {
      const properties = child.properties ?? {}
      const raw = typeof properties.src === 'string' ? properties.src : ''
      const resolved = normalizeImageSource(raw, options)
      if (!resolved) continue

      properties.src = resolved.src
      properties.loading = 'lazy'
      properties.decoding = 'async'
      if (resolved.originalSrc) properties['data-original-src'] = resolved.originalSrc
      child.properties = properties
    } else {
      rewriteImages(child, options)
    }
    kept.push(child)
  }
  node.children = kept
}

/** rehype 插件：在 stringify 之前改写图片地址。 */
export const rehypeImages =
  (options: ImageOptions = {}) =>
  () =>
  (tree: unknown): void => {
    rewriteImages(tree as HastNode, options)
  }
