import { readFile } from 'node:fs/promises'
import { PROVIDERS } from '@shared/providers'
import type { CatalogModel, ModelCatalogSnapshot } from '@shared/types'
import { writeJsonAtomic } from './atomicWrite'

const CATALOG_URL = 'https://models.dev/api.json'
const CACHE_VERSION = 2

/**
 * Remda 的 provider id 与 models.dev 对齐；ollama 不在 models.dev 目录里。
 * 这里从 PROVIDERS 生成，避免维护第二份映射表。
 */
const CATALOG_PROVIDER_IDS = PROVIDERS.filter(
  (provider) => provider.id !== 'ollama'
).map((provider) => provider.id)

/** 供应商列表变化时作废旧缓存，避免 ETag 304 让新供应商永远拿不到模型。 */
const PROVIDER_SIGNATURE = [...CATALOG_PROVIDER_IDS].sort()

const matchesProviderSignature = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== PROVIDER_SIGNATURE.length) return false
  const ids = value.filter((id): id is string => typeof id === 'string').sort()
  return (
    ids.length === PROVIDER_SIGNATURE.length &&
    ids.every((id, index) => id === PROVIDER_SIGNATURE[index])
  )
}

/** embedding、语音、图像等非对话模型 */
const NON_CHAT = /embed|rerank|moderation|tts|whisper|transcrib|speech|audio|image|video|asr|realtime|computer-use/i

interface RawModel {
  id?: unknown
  name?: unknown
  release_date?: unknown
  modalities?: { output?: unknown }
}

interface RawProvider {
  models?: Record<string, RawModel>
}

interface CatalogCacheFile {
  version: number
  providerIds: string[]
  etag: string | null
  updatedAt: number | null
  checkedAt: number | null
  providers: Record<string, CatalogModel[]>
}

const emptySnapshot = (): ModelCatalogSnapshot => ({
  updatedAt: null,
  checkedAt: null,
  providers: {}
})

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.name === 'TimeoutError') return '更新模型目录超时'
  return '无法连接 models.dev'
}

/**
 * models.dev 的结构是 { [providerId]: { models: { [modelId]: {...} } } }。
 * 只保留对话模型，并按发布时间从新到旧排序。
 */
export function parseCatalog(payload: unknown): Record<string, CatalogModel[]> {
  if (!payload || typeof payload !== 'object') return {}
  const source = payload as Record<string, RawProvider>
  const result: Record<string, CatalogModel[]> = {}

  for (const providerId of CATALOG_PROVIDER_IDS) {
    const provider = source[providerId]
    if (!provider || typeof provider.models !== 'object' || !provider.models) continue

    const ranked: { model: CatalogModel; release: string }[] = []
    for (const [key, raw] of Object.entries(provider.models)) {
      if (!raw || typeof raw !== 'object') continue
      const id = typeof raw.id === 'string' && raw.id ? raw.id : key
      const output = raw.modalities?.output
      if (Array.isArray(output) && !output.includes('text')) continue
      if (NON_CHAT.test(id)) continue
      const name = typeof raw.name === 'string' && raw.name ? raw.name : id
      const release = typeof raw.release_date === 'string' ? raw.release_date : ''
      ranked.push({ model: { id, name }, release })
    }

    ranked.sort(
      (a, b) => b.release.localeCompare(a.release) || a.model.id.localeCompare(b.model.id)
    )
    const seen = new Set<string>()
    const models: CatalogModel[] = []
    for (const { model } of ranked) {
      if (seen.has(model.id)) continue
      seen.add(model.id)
      models.push(model)
    }
    if (models.length > 0) result[providerId] = models
  }

  return result
}

export class ModelCatalog {
  private snapshot: ModelCatalogSnapshot | null = null
  private etag: string | null = null
  private pending: Promise<ModelCatalogSnapshot> | null = null

  constructor(
    private readonly file: string,
    private readonly fetchImpl: typeof fetch,
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = 15000
  ) {}

  async get(): Promise<ModelCatalogSnapshot> {
    if (this.snapshot) return this.snapshot
    const raw = await readFile(this.file, 'utf8').catch(() => null)
    if (!raw) {
      this.snapshot = emptySnapshot()
      return this.snapshot
    }
    try {
      const parsed = JSON.parse(raw) as Partial<CatalogCacheFile>
      if (
        parsed.version !== CACHE_VERSION ||
        !matchesProviderSignature(parsed.providerIds) ||
        !parsed.providers
      ) {
        // 旧版本/旧供应商列表：丢掉 ETag，下一次刷新强制走 200 并覆盖缓存。
        this.etag = null
        this.snapshot = emptySnapshot()
        return this.snapshot
      }
      this.etag = typeof parsed.etag === 'string' ? parsed.etag : null
      this.snapshot = {
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null,
        checkedAt: typeof parsed.checkedAt === 'number' ? parsed.checkedAt : null,
        providers: parsed.providers
      }
    } catch {
      this.etag = null
      this.snapshot = emptySnapshot()
    }
    return this.snapshot
  }

  /** 同一时间只跑一个刷新；失败时返回旧快照，不抛异常。 */
  async refresh(): Promise<ModelCatalogSnapshot> {
    if (!this.pending) {
      this.pending = this.runRefresh().finally(() => {
        this.pending = null
      })
    }
    return this.pending
  }

  private async runRefresh(): Promise<ModelCatalogSnapshot> {
    const current = await this.get()
    const now = this.now()
    const headers: Record<string, string> = { 'User-Agent': 'Remda' }
    if (this.etag) headers['If-None-Match'] = this.etag

    let response: Response
    try {
      response = await this.fetchImpl(CATALOG_URL, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (error) {
      return { ...current, lastError: errorMessage(error) }
    }

    if (response.status === 304) {
      const next: ModelCatalogSnapshot = { ...current, checkedAt: now }
      await this.persist({ ...next, etag: this.etag }).catch(() => {})
      this.snapshot = next
      return next
    }

    if (!response.ok) {
      return { ...current, lastError: `models.dev 返回 HTTP ${response.status}` }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      return { ...current, lastError: errorMessage(error) }
    }

    const providers = parseCatalog(payload)
    if (Object.keys(providers).length === 0) {
      return { ...current, lastError: 'models.dev 目录格式异常' }
    }

    const etag = response.headers.get('etag')
    const next: ModelCatalogSnapshot = { updatedAt: now, checkedAt: now, providers }
    this.etag = etag
    this.snapshot = next
    await this.persist({ ...next, etag }).catch(() => {})
    return next
  }

  private async persist(data: {
    etag: string | null
    updatedAt: number | null
    checkedAt: number | null
    providers: Record<string, CatalogModel[]>
  }): Promise<void> {
    await writeJsonAtomic(this.file, {
      version: CACHE_VERSION,
      providerIds: PROVIDER_SIGNATURE,
      ...data
    })
  }
}
