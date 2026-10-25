import { readFile } from 'node:fs/promises'
import type { CatalogModel, ModelCatalogSnapshot } from '@shared/types'
import { writeJsonAtomic } from './atomicWrite'

const CATALOG_URL = 'https://models.dev/api.json'
const CACHE_VERSION = 1

/** Remda 服务商 id → models.dev 服务商 id */
const PROVIDER_MAP: Record<string, string> = {
  deepseek: 'deepseek',
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  openrouter: 'openrouter',
  siliconflow: 'siliconflow',
  moonshot: 'moonshotai',
  zhipu: 'zhipuai',
  dashscope: 'alibaba',
  groq: 'groq',
  mistral: 'mistral',
  xai: 'xai',
  together: 'togetherai',
  perplexity: 'perplexity',
  lmstudio: 'lmstudio'
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

  for (const [remdaId, upstreamId] of Object.entries(PROVIDER_MAP)) {
    const provider = source[upstreamId]
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
    if (models.length > 0) result[remdaId] = models
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
      if (parsed.version !== CACHE_VERSION || !parsed.providers) throw new Error('bad cache')
      this.etag = typeof parsed.etag === 'string' ? parsed.etag : null
      this.snapshot = {
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null,
        checkedAt: typeof parsed.checkedAt === 'number' ? parsed.checkedAt : null,
        providers: parsed.providers
      }
    } catch {
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

  private async persist(data: Omit<CatalogCacheFile, 'version'>): Promise<void> {
    await writeJsonAtomic(this.file, { ...data, version: CACHE_VERSION })
  }
}
