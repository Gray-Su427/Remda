/** @vitest-environment node */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeLocalPath, ImageProxy, MAX_IMAGE_BYTES } from './imageProxy'

const hex = (path: string): string => Buffer.from(path, 'utf8').toString('hex')
const localUrl = (path: string): string => `remda-img://local/?path=${hex(path)}`
const remoteUrl = (url: string): string =>
  `remda-img://remote/?url=${encodeURIComponent(url)}`

let dir: string
let proxy: ImageProxy

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'remda-img-'))
  await mkdir(join(dir, 'root', 'sub'), { recursive: true })
  await mkdir(join(dir, 'root', 'assets'), { recursive: true })
  await mkdir(join(dir, 'outside'), { recursive: true })
  await writeFile(join(dir, 'root', 'sub', 'a.png'), 'png-a')
  await writeFile(join(dir, 'root', 'assets', 'b.jpg'), 'jpg-b')
  await writeFile(join(dir, 'root', 'notes.txt'), 'not an image')
  await writeFile(join(dir, 'outside', 'c.png'), 'png-c')
  proxy = new ImageProxy()
  await proxy.allowRoot(join(dir, 'root'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('decodeLocalPath', () => {
  it('accepts only absolute hex paths', () => {
    expect(decodeLocalPath(hex(join(dir, 'a.png')))).toBe(join(dir, 'a.png'))
    expect(decodeLocalPath(null)).toBeNull()
    expect(decodeLocalPath('abc')).toBeNull()
    expect(decodeLocalPath('zz')).toBeNull()
    expect(decodeLocalPath(Buffer.from('a.png').toString('hex'))).toBeNull()
  })
})

describe('ImageProxy local images', () => {
  it('serves files inside an allowed root', async () => {
    const response = await proxy.handle(new Request(localUrl(join(dir, 'root', 'sub', 'a.png'))))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('png-a')
  })

  it('rejects files outside every root', async () => {
    const response = await proxy.handle(new Request(localUrl(join(dir, 'outside', 'c.png'))))
    expect(response.status).toBe(403)
  })

  it('lets a single document reach its parent directory but not further', async () => {
    await mkdir(join(dir, 'notes', 'ch1'), { recursive: true })
    await mkdir(join(dir, 'notes', 'assets'), { recursive: true })
    await writeFile(join(dir, 'notes', 'assets', 'pic.png'), 'pic')
    await proxy.allowDocument(join(dir, 'notes', 'ch1', 'doc.md'))

    const sibling = await proxy.handle(new Request(localUrl(join(dir, 'notes', 'assets', 'pic.png'))))
    expect(sibling.status).toBe(200)

    const outside = await proxy.handle(new Request(localUrl(join(dir, 'outside', 'c.png'))))
    expect(outside.status).toBe(403)
  })

  it('rejects non-image extensions and missing files', async () => {
    const text = await proxy.handle(new Request(localUrl(join(dir, 'root', 'notes.txt'))))
    expect(text.status).toBe(415)

    const missing = await proxy.handle(new Request(localUrl(join(dir, 'root', 'nope.png'))))
    expect(missing.status).toBe(404)
  })

  it('rejects images above the size limit before reading them', async () => {
    const readFileImpl = vi.fn(async () => Buffer.from('x'))
    const limited = new ImageProxy({
      readFileImpl: readFileImpl as unknown as typeof readFile,
      statImpl: async () => ({ isFile: () => true, size: MAX_IMAGE_BYTES + 1 }) as never
    })
    await limited.allowRoot(join(dir, 'root'))

    const response = await limited.handle(
      new Request(localUrl(join(dir, 'root', 'sub', 'a.png')))
    )
    expect(response.status).toBe(413)
    expect(readFileImpl).not.toHaveBeenCalled()
  })

  it.skipIf(process.platform === 'win32')('blocks symlinks that escape the root', async () => {
    const { symlink } = await import('node:fs/promises')
    await symlink(join(dir, 'outside', 'c.png'), join(dir, 'root', 'link.png'))
    const response = await proxy.handle(new Request(localUrl(join(dir, 'root', 'link.png'))))
    expect(response.status).toBe(403)
  })
})

describe('ImageProxy remote images', () => {
  it('proxies http images and strips unsafe headers', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'image/webp',
          'set-cookie': 'secret=1',
          etag: '"v1"'
        }
      })
    ) as unknown as typeof fetch
    const remote = new ImageProxy({ fetchImpl })

    const response = await remote.handle(new Request(remoteUrl('http://example.com/a.webp')))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('etag')).toBe('"v1"')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects non-http schemes and credentials', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const remote = new ImageProxy({ fetchImpl })

    expect((await remote.handle(new Request(remoteUrl('ftp://example.com/a.png')))).status).toBe(400)
    expect(
      (await remote.handle(new Request(remoteUrl('http://user:pass@example.com/a.png')))).status
    ).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps network failures and non-image content to readable statuses', async () => {
    const broken = new ImageProxy({
      fetchImpl: (async () => {
        throw new TypeError('offline')
      }) as typeof fetch
    })
    expect((await broken.handle(new Request(remoteUrl('http://example.com/a.png')))).status).toBe(502)

    const html = new ImageProxy({
      fetchImpl: (async () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })) as typeof fetch
    })
    expect((await html.handle(new Request(remoteUrl('http://example.com/a.png')))).status).toBe(415)
  })

  it('passes through upstream errors and enforces the size cap', async () => {
    const missing = new ImageProxy({
      fetchImpl: (async () => new Response(null, { status: 404 })) as typeof fetch
    })
    expect((await missing.handle(new Request(remoteUrl('http://example.com/a.png')))).status).toBe(
      404
    )

    const huge = new ImageProxy({
      fetchImpl: (async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(MAX_IMAGE_BYTES + 1)
          }
        })) as typeof fetch
    })
    expect((await huge.handle(new Request(remoteUrl('http://example.com/a.png')))).status).toBe(413)
  })
})
