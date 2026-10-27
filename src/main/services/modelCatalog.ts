import { readFile } from 'node:fs/promises'
import { baseUrlKey, PROVIDERS, providerProtocol } from '@shared/providers'
import type { CatalogModel, LlmProtocol, ModelCatalogSnapshot } from '@shared/types'
import { writeJsonAtomic } from './atomicWrite'

const CATALOG_URL = 'https://models.dev/api.json'
const CACHE_VERSION = 5
const PUBLIC_MODELS_TIMEOUT_MS = 5000
const PUBLIC_MODELS_CONCURRENCY = 6
const PUBLIC_MODELS_LIMIT = 300

/**
 * Remda 的 provider id 与 models.dev 对齐；ollama 不在 models.dev 目录里。
 * 这里从 PROVIDERS 生成，避免维护第二份映射表。
 */
const CATALOG_PROVIDER_IDS = PROVIDERS.filter(
  (provider) => provider.id !== 'ollama'
).map((provider) => provider.id)

/** 供应商列表变化时作废旧缓存，避免 ETag 304 让新供应商永远拿不到模型。 */
const PROVIDER_SIGNATURE = [...CATALOG_PROVIDER_IDS].sort()

/**
 * 这些供应商在 models.dev 里可能使用原生 SDK，但 Remda 故意走 OpenAI 兼容 endpoint。
 * 只有它们可以忽略模型级 npm，其余供应商必须尊重 models.dev 的协议信息。
 */
const MANUAL_OPENAI_CHAT_PROVIDERS = new Set([
  'deepseek',
  'openai',
  'google',
  'anthropic',
  'groq',
  'mistral',
  'xai',
  'togetherai',
  'perplexity',
  'deepinfra',
  'cerebras',
  'openrouter',
  'lmstudio',
  'ollama'
])

const PRESET_BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]))

/** models.dev 的 npm 包名到 Remda 协议的映射；未知包名视为不可调用。 */
const NPM_PROTOCOLS: Record<string, LlmProtocol> = {
  '@ai-sdk/openai-compatible': 'openai-chat',
  '@ai-sdk/openai': 'openai-responses',
  '@ai-sdk/anthropic': 'anthropic',
  '@ai-sdk/google': 'google'
}

const matchesProviderSignature = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== PROVIDER_SIGNATURE.length) return false
  const ids = value.filter((id): id is string => typeof id === 'string').sort()
  return (
    ids.length === PROVIDER_SIGNATURE.length &&
    ids.every((id, index) => id === PROVIDER_SIGNATURE[index])
  )
}

/** embedding、语音、图像、重排等非对话模型 */
const NON_CHAT =
  /embed|rerank|moderation|tts|whisper|transcrib|speech|audio|image|video|asr|realtime|computer-use|ocr|guard|orpheus|voice|speaker|bevformer|sparsedrive|paligemma|usdcode|usdvalidate|riva|stable-diffusion|spec-prefill|bge/i

interface RawModel {
  id?: unknown
  name?: unknown
  release_date?: unknown
  status?: unknown
  modalities?: { output?: unknown }
  /** models.dev 的模型级协议覆盖 */
  provider?: { npm?: unknown; api?: unknown }
}

interface RawProvider {
  npm?: unknown
  api?: unknown
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

const dedupeModels = (models: CatalogModel[]): CatalogModel[] => {
  const seen = new Set<string>()
  const result: CatalogModel[] = []
  for (const model of models) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    result.push(model)
  }
  return result
}

/**
 * models.dev 的结构是 { [providerId]: { models: { [modelId]: {...} } } }。
 * - 普通供应商按预设协议过滤模型；混合协议网关按模型级 npm 解析协议与 endpoint
 * - 有活跃模型时过滤 deprecated；全部 deprecated 时保留并标记
 * - 按发布时间从新到旧排序
 */
export function parseCatalog(payload: unknown): Record<string, CatalogModel[]> {
  if (!payload || typeof payload !== 'object') return {}
  const source = payload as Record<string, RawProvider>
  const result: Record<string, CatalogModel[]> = {}

  for (const providerId of CATALOG_PROVIDER_IDS) {
    const provider = source[providerId]
    if (!provider || typeof provider.models !== 'object' || !provider.models) continue

    const preset = PRESET_BY_ID.get(providerId)
    if (!preset) continue
    const mixed = preset.mixed === true
    const manual = MANUAL_OPENAI_CHAT_PROVIDERS.has(providerId)
    const defaultProtocol = providerProtocol(preset)
    const providerApi = typeof provider.api === 'string' ? provider.api : preset.baseUrl
    const ranked: { model: CatalogModel; release: string; deprecated: boolean }[] = []

    for (const [key, raw] of Object.entries(provider.models)) {
      if (!raw || typeof raw !== 'object') continue
      const id = typeof raw.id === 'string' && raw.id ? raw.id : key
      const npm = typeof raw.provider?.npm === 'string' ? raw.provider.npm : provider.npm
      const modelApi = typeof raw.provider?.api === 'string' ? raw.provider.api : null

      if (mixed) {
        // 混合协议网关：只跳过 Remda 不支持的协议（Bedrock、Azure、systemone 等）。
        if (typeof npm !== 'string' || !NPM_PROTOCOLS[npm]) continue
      } else if (!manual && npm !== '@ai-sdk/openai-compatible') {
        continue
      }
      if (!mixed && modelApi && baseUrlKey(modelApi) !== baseUrlKey(providerApi)) continue

      const output = raw.modalities?.output
      if (Array.isArray(output) && !output.includes('text')) continue
      if (NON_CHAT.test(id)) continue

      const name = typeof raw.name === 'string' && raw.name ? raw.name : id
      const release = typeof raw.release_date === 'string' ? raw.release_date : ''
      const deprecated = raw.status === 'deprecated'
      const model: CatalogModel = deprecated ? { id, name, deprecated: true } : { id, name }

      if (mixed && typeof npm === 'string') {
        const protocol = NPM_PROTOCOLS[npm]!
        if (protocol !== defaultProtocol) model.protocol = protocol
        if (modelApi && baseUrlKey(modelApi) !== baseUrlKey(providerApi)) {
          model.apiBase = modelApi
        }
      }

      ranked.push({ model, release, deprecated })
    }

    ranked.sort(
      (a, b) => b.release.localeCompare(a.release) || a.model.id.localeCompare(b.model.id)
    )
    const active = ranked.filter((item) => !item.deprecated)
    const selected = active.length > 0 ? active : ranked
    const models = dedupeModels(selected.map((item) => item.model))
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
    private readonly timeoutMs = 15000,
    private readonly validatePublicModels = false
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
        // 旧版本/旧供应商列表/旧过滤规则：丢掉 ETag，下一次刷新强制走 200 并覆盖缓存。
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
      const providers = this.validatePublicModels
        ? await this.mergePublicModels(current.providers)
        : current.providers
      const next: ModelCatalogSnapshot = { ...current, checkedAt: now, providers }
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

    const parsed = parseCatalog(payload)
    if (Object.keys(parsed).length === 0) {
      return { ...current, lastError: 'models.dev 目录格式异常' }
    }

    const providers = this.validatePublicModels
      ? await this.mergePublicModels(parsed)
      : parsed
    const etag = response.headers.get('etag')
    const next: ModelCatalogSnapshot = { updatedAt: now, checkedAt: now, providers }
    this.etag = etag
    this.snapshot = next
    await this.persist({ ...next, etag }).catch(() => {})
    return next
  }

  /**
   * 公开 /models 交叉校验：
   * - 混合协议供应商只做交集，绝不新增原生协议模型
   * - 普通供应商以接口列表为准，修复 models.dev 的过期 ID
   * - 大列表只取与 models.dev 的交集，避免上千项
   */
  private async mergePublicModels(
    providers: Record<string, CatalogModel[]>
  ): Promise<Record<string, CatalogModel[]>> {
    const targets = PROVIDERS.filter((provider) => provider.modelsUrl)
    if (targets.length === 0) return providers

    const results = new Map<string, string[] | null>()
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < targets.length) {
        const index = cursor
        cursor += 1
        const provider = targets[index]!
        results.set(provider.id, await this.fetchPublicModelIds(provider.modelsUrl!))
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PUBLIC_MODELS_CONCURRENCY, targets.length) }, () => worker())
    )

    const merged = { ...providers }
    for (const provider of targets) {
      const endpointIds = results.get(provider.id)
      if (!endpointIds || endpointIds.length === 0) continue

      const parsed = providers[provider.id] ?? []
      const endpointSet = new Set(endpointIds)
      const byId = new Map(parsed.map((model) => [model.id, model]))
      const fromEndpoint = (ids: string[]): CatalogModel[] =>
        ids.map((id) => byId.get(id) ?? { id, name: id })

      let models: CatalogModel[]
      if (provider.mixed || parsed.length === 0) {
        const intersection = parsed.filter((model) => endpointSet.has(model.id))
        if (intersection.length > 0) {
          models = intersection
        } else if (provider.mixed) {
          continue
        } else {
          models = fromEndpoint(endpointIds.slice(0, PUBLIC_MODELS_LIMIT))
        }
      } else if (endpointIds.length <= PUBLIC_MODELS_LIMIT) {
        models = fromEndpoint(endpointIds)
      } else {
        const intersection = parsed.filter((model) => endpointSet.has(model.id))
        models =
          intersection.length >= 20
            ? intersection
            : fromEndpoint(endpointIds.slice(0, PUBLIC_MODELS_LIMIT))
      }

      const deduped = dedupeModels(models)
      if (deduped.length > 0) merged[provider.id] = deduped
    }

    return merged
  }

  private async fetchPublicModelIds(url: string): Promise<string[] | null> {
    try {
      const response = await this.fetchImpl(url, {
        headers: { 'User-Agent': 'Remda' },
        signal: AbortSignal.timeout(PUBLIC_MODELS_TIMEOUT_MS)
      })
      if (!response.ok) return null
      const payload = (await response.json()) as { data?: unknown; models?: unknown }
      const raw = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.models)
          ? payload.models
          : []
      const ids: string[] = []
      for (const item of raw) {
        const id =
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
              ? (item as { id: string }).id
              : null
        if (id && !NON_CHAT.test(id)) ids.push(id)
      }
      return ids
    } catch {
      return null
    }
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
