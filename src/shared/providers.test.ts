import { describe, expect, it } from 'vitest'
import {
  baseUrlKey,
  isLlmProtocol,
  isLoopbackBaseUrl,
  matchProviderByBaseUrl,
  PROVIDERS,
  resolveModelProtocol
} from './providers'

describe('PROVIDERS', () => {
  it('has 60+ aligned presets with unique ids and base urls', () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(60)
    const ids = PROVIDERS.map((provider) => provider.id)
    expect(new Set(ids).size).toBe(ids.length)
    const urls = PROVIDERS.map((provider) => baseUrlKey(provider.baseUrl))
    expect(new Set(urls).size).toBe(urls.length)
    for (const provider of PROVIDERS) {
      expect(provider.name.length).toBeGreaterThan(0)
      expect(provider.baseUrl).toMatch(/^https?:\/\//)
      expect(provider.baseUrl).not.toContain('${')
      expect(() => new URL(provider.baseUrl)).not.toThrow()
      if (provider.docUrl) expect(provider.docUrl).toMatch(/^https:\/\//)
      if (provider.modelsUrl) expect(provider.modelsUrl).toMatch(/^https:\/\//)
      if (provider.keyUrl) expect(provider.keyUrl).toMatch(/^https:\/\//)
    }
  })

  it('includes the common coding plan endpoints', () => {
    const ids = new Set(PROVIDERS.map((provider) => provider.id))
    for (const id of [
      'opencode-go',
      'kimi-code-plan-cn',
      'kimi-code-plan-global',
      'zhipuai-coding-plan',
      'zai-coding-plan',
      'alibaba-coding-plan-cn',
      'alibaba-coding-plan',
      'tencent-coding-plan',
      'volcengine-coding-plan',
      'xiaomi-token-plan-cn',
      'stepfun-step-plan',
      'stepfun-ai-step-plan'
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('ships a non-empty model list containing the default model', () => {
    for (const provider of PROVIDERS) {
      expect(provider.models.length).toBeGreaterThan(0)
      const ids = provider.models.map((model) => model.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toContain(provider.defaultModel)
      for (const model of provider.models) expect(model.name.length).toBeGreaterThan(0)
    }
  })

  it('keeps all-deprecated providers but marks their models', () => {
    const perplexity = PROVIDERS.find((provider) => provider.id === 'perplexity')
    expect(perplexity).toBeDefined()
    expect(perplexity!.models.length).toBeGreaterThan(0)
    expect(perplexity!.models.every((model) => model.deprecated)).toBe(true)
  })

  it('marks only local presets and gives them no key page', () => {
    const local = PROVIDERS.filter((provider) => provider.local).map((provider) => provider.id)
    expect(local.sort()).toEqual(['lmstudio', 'ollama'])
    for (const provider of PROVIDERS) {
      if (!provider.local) expect(provider.keyUrl ?? provider.docUrl).toMatch(/^https:\/\//)
    }
  })

  it('declares the anthropic protocol and the mixed-protocol gateways', () => {
    expect(PROVIDERS.find((provider) => provider.id === 'anthropic')?.protocol).toBe('anthropic')

    const mixed = PROVIDERS.filter((provider) => provider.mixed).map((provider) => provider.id)
    expect(mixed.sort()).toEqual([
      'alibaba-coding-plan',
      'alibaba-coding-plan-cn',
      'kimi-code-plan-cn',
      'kimi-code-plan-global',
      'opencode',
      'opencode-go',
      'stepfun-ai-step-plan',
      'stepfun-step-plan',
      'tencent-coding-plan',
      'volcengine-coding-plan',
      'xiaomi-token-plan-cn',
      'zai-coding-plan',
      'zhipuai-coding-plan'
    ])
    for (const provider of PROVIDERS) {
      if (provider.protocol) expect(isLlmProtocol(provider.protocol)).toBe(true)
    }
  })
})

describe('resolveModelProtocol', () => {
  const anthropic = PROVIDERS.find((provider) => provider.id === 'anthropic')!
  const opencodeGo = PROVIDERS.find((provider) => provider.id === 'opencode-go')!

  it('uses the preset protocol for ordinary providers', () => {
    expect(resolveModelProtocol(anthropic, { id: 'claude-sonnet-5', name: 'Claude' })).toEqual({
      protocol: 'anthropic',
      apiBase: ''
    })
    expect(resolveModelProtocol(null)).toEqual({ protocol: 'openai-chat', apiBase: '' })
  })

  it('prefers model-level protocol and endpoint on mixed gateways', () => {
    expect(
      resolveModelProtocol(opencodeGo, {
        id: 'claude-haiku-5-5',
        name: 'Claude',
        protocol: 'anthropic',
        apiBase: 'https://opencode.ai/inference/go/anthropic/v1'
      })
    ).toEqual({
      protocol: 'anthropic',
      apiBase: 'https://opencode.ai/inference/go/anthropic/v1'
    })
  })

  it('falls back to the provider protocol for plain models on mixed gateways', () => {
    expect(resolveModelProtocol(opencodeGo, { id: 'deepseek-v4.1-flash', name: 'DeepSeek' })).toEqual(
      { protocol: 'openai-chat', apiBase: '' }
    )
  })

  it('validates protocol strings', () => {
    expect(isLlmProtocol('anthropic')).toBe(true)
    expect(isLlmProtocol('bedrock')).toBe(false)
    expect(isLlmProtocol(undefined)).toBe(false)
  })
})

describe('matchProviderByBaseUrl', () => {
  it('ignores case and trailing slashes', () => {
    expect(matchProviderByBaseUrl(' https://API.DeepSeek.com/v1/// ')?.id).toBe('deepseek')
  })

  it('matches declared aliases such as the models.dev api form', () => {
    expect(matchProviderByBaseUrl('https://api.deepseek.com')?.id).toBe('deepseek')
  })

  it('returns null for custom urls', () => {
    expect(matchProviderByBaseUrl('https://example.com/v1')).toBeNull()
    expect(matchProviderByBaseUrl('')).toBeNull()
  })
})

describe('baseUrlKey', () => {
  it('normalizes case, whitespace and trailing slashes', () => {
    expect(baseUrlKey(' https://API.DeepSeek.com/v1/// ')).toBe('https://api.deepseek.com/v1')
    expect(baseUrlKey('')).toBe('')
  })
})

describe('isLoopbackBaseUrl', () => {
  it('accepts loopback hosts only', () => {
    expect(isLoopbackBaseUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLoopbackBaseUrl('http://127.0.0.1:1234/v1')).toBe(true)
    expect(isLoopbackBaseUrl('http://[::1]:1234/v1')).toBe(true)
    expect(isLoopbackBaseUrl('https://api.deepseek.com/v1')).toBe(false)
    expect(isLoopbackBaseUrl('http://192.168.1.10:11434/v1')).toBe(false)
    expect(isLoopbackBaseUrl('not a url')).toBe(false)
  })
})
