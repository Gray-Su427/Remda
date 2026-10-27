/** @vitest-environment node */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelCatalog, parseCatalog } from './modelCatalog'

const fixture = {
  openai: {
    models: {
      'gpt-5.4-mini': {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 mini',
        release_date: '2026-03-17',
        modalities: { output: ['text'] }
      },
      'gpt-5.4': {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        release_date: '2026-05-01',
        modalities: { output: ['text'] }
      },
      'gpt-image-1': {
        id: 'gpt-image-1',
        name: 'GPT Image',
        release_date: '2026-06-01',
        modalities: { output: ['image'] }
      },
      'text-embedding-3-small': {
        id: 'text-embedding-3-small',
        name: 'Embedding',
        release_date: '2026-01-01',
        modalities: { output: ['text'] }
      }
    }
  },
  deepseek: {
    models: {
      'deepseek-flash': {
        id: 'deepseek-flash',
        name: 'DeepSeek Flash',
        release_date: '2026-10-17',
        modalities: { output: ['text'] }
      }
    }
  },
  'fireworks-ai': {
    models: {
      'accounts/fireworks/models/minimax-m3p1-flash': {
        id: 'accounts/fireworks/models/minimax-m3p1-flash',
        name: 'MiniMax-M3.1-Flash',
        release_date: '2026-09-01',
        modalities: { output: ['text'] }
      }
    }
  },
  ollama: {
    models: {
      'qwen3:8b': { id: 'qwen3:8b', name: 'Qwen3 8B', modalities: { output: ['text'] } }
    }
  }
}

const tempDirs: string[] = []

async function makeCatalogFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'remda-catalog-'))
  tempDirs.push(dir)
  return join(dir, 'model-catalog.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('parseCatalog', () => {
  it('keeps only text chat models and sorts newest first', () => {
    const catalog = parseCatalog(fixture)
    expect(catalog.openai.map((model) => model.id)).toEqual(['gpt-5.4', 'gpt-5.4-mini'])
    expect(catalog.openai[0]).toEqual({ id: 'gpt-5.4', name: 'GPT-5.4' })
    expect(catalog.deepseek).toEqual([{ id: 'deepseek-flash', name: 'DeepSeek Flash' }])
  })

  it('ignores providers without a Remda mapping', () => {
    expect(parseCatalog(fixture).ollama).toBeUndefined()
  })

  it('maps newly added providers by their models.dev id', () => {
    expect(parseCatalog(fixture)['fireworks-ai']).toEqual([
      { id: 'accounts/fireworks/models/minimax-m3p1-flash', name: 'MiniMax-M3.1-Flash' }
    ])
  })

  it('tolerates malformed payloads', () => {
    expect(parseCatalog(null)).toEqual({})
    expect(parseCatalog([])).toEqual({})
    expect(parseCatalog({ openai: {} })).toEqual({})
  })
})

describe('ModelCatalog', () => {
  it('downloads, parses and caches the catalog', async () => {
    const file = await makeCatalogFile()
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { etag: 'W/"v1"' }
      })
    }) as unknown as typeof fetch
    const now = 1_000_000
    const catalog = new ModelCatalog(file, fetchImpl, () => now)

    const snapshot = await catalog.refresh()
    expect(snapshot.updatedAt).toBe(now)
    expect(snapshot.checkedAt).toBe(now)
    expect(snapshot.providers.openai?.length).toBe(2)

    const cached = JSON.parse(await readFile(file, 'utf8')) as {
      version: number
      providerIds: string[]
      etag: string
      providers: Record<string, unknown>
    }
    expect(cached.version).toBe(2)
    expect(cached.providerIds).toContain('openai')
    expect(cached.providerIds).toContain('siliconflow-cn')
    expect(cached.etag).toBe('W/"v1"')
    expect(cached.providers.openai).toBeDefined()
  })

  it('invalidates a legacy cache and forces a full download', async () => {
    const file = await makeCatalogFile()
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        etag: 'W/"old"',
        updatedAt: 111,
        checkedAt: 222,
        providers: { siliconflow: [{ id: 'old', name: 'old' }] }
      }),
      'utf8'
    )

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      expect(headers['If-None-Match']).toBeUndefined()
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { etag: 'W/"new"' }
      })
    }) as unknown as typeof fetch

    const catalog = new ModelCatalog(file, fetchImpl, () => 5000)
    expect((await catalog.get()).providers).toEqual({})

    const snapshot = await catalog.refresh()
    expect(snapshot.providers.openai?.length).toBe(2)

    const cached = JSON.parse(await readFile(file, 'utf8')) as {
      version: number
      providerIds: string[]
      etag: string
    }
    expect(cached.version).toBe(2)
    expect(cached.providerIds).toContain('siliconflow-cn')
    expect(cached.etag).toBe('W/"new"')
  })

  it('invalidates a cache whose provider signature changed', async () => {
    const file = await makeCatalogFile()
    await writeFile(
      file,
      JSON.stringify({
        version: 2,
        providerIds: ['openai'],
        etag: 'W/"old"',
        updatedAt: 1,
        checkedAt: 1,
        providers: { openai: [{ id: 'stale', name: 'stale' }] }
      }),
      'utf8'
    )

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      expect(headers['If-None-Match']).toBeUndefined()
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { etag: 'W/"new"' }
      })
    }) as unknown as typeof fetch

    const catalog = new ModelCatalog(file, fetchImpl, () => 6000)
    expect((await catalog.get()).providers).toEqual({})
    await catalog.refresh()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reads the cache and sends If-None-Match on refresh', async () => {
    const file = await makeCatalogFile()
    const firstFetch = vi.fn(async () => {
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { etag: 'W/"v1"' }
      })
    }) as unknown as typeof fetch
    let now = 1000
    const first = new ModelCatalog(file, firstFetch, () => now)
    await first.refresh()

    now = 2000
    const secondFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('W/"v1"')
      return new Response(null, { status: 304 })
    }) as unknown as typeof fetch
    const second = new ModelCatalog(file, secondFetch, () => now)

    const cached = await second.get()
    expect(cached.updatedAt).toBe(1000)
    expect(cached.providers.deepseek?.length).toBe(1)

    const refreshed = await second.refresh()
    expect(refreshed.checkedAt).toBe(2000)
    expect(refreshed.updatedAt).toBe(1000)
    expect(refreshed.providers.deepseek?.length).toBe(1)
  })

  it('falls back to the cached snapshot when the network fails', async () => {
    const file = await makeCatalogFile()
    const okFetch = vi.fn(async () => {
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { etag: 'W/"v1"' }
      })
    }) as unknown as typeof fetch
    await new ModelCatalog(file, okFetch, () => 1000).refresh()

    const failFetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const catalog = new ModelCatalog(file, failFetch, () => 2000)
    const snapshot = await catalog.refresh()
    expect(snapshot.updatedAt).toBe(1000)
    expect(snapshot.providers.openai?.length).toBe(2)
    expect(snapshot.lastError).toContain('models.dev')
  })

  it('starts empty when there is no cache', async () => {
    const file = await makeCatalogFile()
    const catalog = new ModelCatalog(file, (async () => new Response()) as typeof fetch)
    expect(await catalog.get()).toEqual({ updatedAt: null, checkedAt: null, providers: {} })
  })
})
