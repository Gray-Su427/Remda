import { PROVIDER_PRESETS, type ProviderPreset } from './providerPresets'
import type { CatalogModel, LlmProtocol } from './types'

export type { ProviderPreset }

export const PROTOCOLS: LlmProtocol[] = [
  'openai-chat',
  'openai-responses',
  'anthropic',
  'google'
]

export const DEFAULT_PROTOCOL: LlmProtocol = 'openai-chat'

export function isLlmProtocol(value: unknown): value is LlmProtocol {
  return typeof value === 'string' && (PROTOCOLS as string[]).includes(value)
}

/** 供应商的默认协议；混合协议网关仍以模型级信息为准。 */
export function providerProtocol(provider: ProviderPreset | null | undefined): LlmProtocol {
  return provider?.protocol ?? DEFAULT_PROTOCOL
}

/**
 * 解析某个模型实际使用的协议与请求基址。
 *
 * - 普通供应商只看预设；
 * - 混合协议网关优先使用模型级 protocol / apiBase，缺失时回退到预设默认协议。
 */
export function resolveModelProtocol(
  provider: ProviderPreset | null | undefined,
  model?: CatalogModel | null
): { protocol: LlmProtocol; apiBase: string } {
  if (provider?.mixed && model?.protocol) {
    return { protocol: model.protocol, apiBase: model.apiBase ?? '' }
  }
  return { protocol: providerProtocol(provider), apiBase: '' }
}

/**
 * 内置供应商预设。
 *
 * id / name / baseUrl / docUrl / models 与 models.dev 对齐，
 * 数据来自 `providerPresets.ts`；后续可以替换为联网目录 + 手工覆盖。
 */
export const PROVIDERS: ProviderPreset[] = PROVIDER_PRESETS

const normalize = (value: string): string => value.trim().toLowerCase()

/** 用于给 API Key 分组/反查的 Base URL 规范形式（忽略大小写与结尾斜杠）。 */
export function baseUrlKey(baseUrl: string): string {
  return normalize(baseUrl).replace(/\/+$/, '')
}

/** 根据已保存的 baseUrl 反推服务商；同时匹配 aliases。 */
export function matchProviderByBaseUrl(baseUrl: string): ProviderPreset | null {
  const target = baseUrlKey(baseUrl)
  if (!target) return null
  return (
    PROVIDERS.find(
      (provider) =>
        baseUrlKey(provider.baseUrl) === target ||
        (provider.aliases ?? []).some((alias) => baseUrlKey(alias) === target)
    ) ?? null
  )
}

/** 仅 localhost / 127.0.0.1 / [::1] 视为本地服务，可不需要 API Key。 */
export function isLoopbackBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}
