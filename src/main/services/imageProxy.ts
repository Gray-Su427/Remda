import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const REMOTE_TIMEOUT_MS = 15000

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

export interface ImageProxyDeps {
  fetchImpl?: typeof fetch
  readFileImpl?: typeof readFile
  statImpl?: typeof stat
  realpathImpl?: typeof realpath
  timeoutMs?: number
}

interface ResolvedDeps {
  fetchImpl: typeof fetch
  readFileImpl: typeof readFile
  statImpl: typeof stat
  realpathImpl: typeof realpath
  timeoutMs: number
}

const fail = (status: number, message: string): Response =>
  new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })

/** hex → 绝对路径；非绝对路径、非法 hex 一律拒绝。 */
export function decodeLocalPath(hex: string | null): string | null {
  if (!hex || hex.length % 2 !== 0 || hex.length > 16384 || !/^[0-9a-f]+$/i.test(hex)) {
    return null
  }
  const path = Buffer.from(hex, 'hex').toString('utf8')
  return isAbsolute(path) ? path : null
}

export class ImageProxy {
  private readonly roots = new Set<string>()
  private readonly deps: ResolvedDeps

  constructor(deps: ImageProxyDeps = {}) {
    this.deps = {
      fetchImpl: deps.fetchImpl ?? fetch,
      readFileImpl: deps.readFileImpl ?? readFile,
      statImpl: deps.statImpl ?? stat,
      realpathImpl: deps.realpathImpl ?? realpath,
      timeoutMs: deps.timeoutMs ?? REMOTE_TIMEOUT_MS
    }
  }

  /** 打开文件夹时允许整个工作区。 */
  async allowRoot(dir: string): Promise<void> {
    this.roots.add(await this.resolveReal(dir))
  }

  /**
   * 打开单个文件时允许其所在目录及上一级（支持 `../assets`）。
   * 文件已经在已打开的工作区内时不再放宽。
   */
  async allowDocument(file: string): Promise<void> {
    const dir = await this.resolveReal(dirname(file))
    if (this.contains(dir)) return
    this.roots.add(dir)
    const parent = dirname(dir)
    if (parent !== dir) this.roots.add(await this.resolveReal(parent))
  }

  async handle(request: Request): Promise<Response> {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return fail(400, '图片地址无效')
    }
    if (url.protocol !== 'remda-img:') return fail(400, '不支持的图片协议')

    if (url.hostname === 'remote') return this.handleRemote(url.searchParams.get('url'))
    if (url.hostname === 'local') return this.handleLocal(url.searchParams.get('path'))
    return fail(400, '未知的图片来源')
  }

  private async handleRemote(target: string | null): Promise<Response> {
    if (!target) return fail(400, '缺少图片地址')

    let url: URL
    try {
      url = new URL(target)
    } catch {
      return fail(400, '图片地址无效')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fail(400, '只允许 http/https 图片')
    }
    if (url.username || url.password) return fail(400, '图片地址不能包含账号密码')

    let upstream: Response
    try {
      upstream = await this.deps.fetchImpl(target, {
        headers: {
          'User-Agent': 'Remda',
          Accept: 'image/*,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.deps.timeoutMs)
      })
    } catch {
      return fail(502, '图片下载失败')
    }

    if (!upstream.ok) return new Response(null, { status: upstream.status })

    const length = Number(upstream.headers.get('content-length') ?? '')
    if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) {
      return fail(413, '图片超过 20MB')
    }

    const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase()
    if (
      contentType &&
      !contentType.startsWith('image/') &&
      !contentType.includes('octet-stream')
    ) {
      return fail(415, '返回内容不是图片')
    }
    if (!upstream.body) return fail(502, '图片内容为空')

    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    headers.set('Cache-Control', upstream.headers.get('cache-control') ?? 'public, max-age=300')
    for (const key of ['etag', 'last-modified']) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    return new Response(upstream.body, { status: 200, headers })
  }

  private async handleLocal(hex: string | null): Promise<Response> {
    const path = decodeLocalPath(hex)
    if (!path) return fail(400, '本地图片地址无效')

    const real = await this.deps.realpathImpl(path).catch(() => null)
    if (!real) return fail(404, '图片不存在')

    const mime = MIME_TYPES[extname(real).toLowerCase()]
    if (!mime) return fail(415, '不支持的图片格式')
    if (!this.contains(real)) return fail(403, '图片不在已打开的目录内')

    const info = await this.deps.statImpl(real).catch(() => null)
    if (!info || !info.isFile()) return fail(404, '图片不存在')
    if (info.size > MAX_IMAGE_BYTES) return fail(413, '图片超过 20MB')

    const data = await this.deps.readFileImpl(real).catch(() => null)
    if (!data) return fail(404, '图片不存在')

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' }
    })
  }

  private contains(target: string): boolean {
    for (const root of this.roots) {
      const rel = relative(root, target)
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return true
    }
    return false
  }

  private async resolveReal(path: string): Promise<string> {
    return this.deps.realpathImpl(path).catch(() => resolve(path))
  }
}
