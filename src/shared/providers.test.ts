import { describe, expect, it } from 'vitest'
import { baseUrlKey, isLoopbackBaseUrl, matchProviderByBaseUrl, PROVIDERS } from './providers'

describe('PROVIDERS', () => {
  it('has 50 aligned presets with unique ids and base urls', () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(50)
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
      if (provider.keyUrl) expect(provider.keyUrl).toMatch(/^https:\/\//)
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

  it('marks only local presets and gives them no key page', () => {
    const local = PROVIDERS.filter((provider) => provider.local).map((provider) => provider.id)
    expect(local.sort()).toEqual(['lmstudio', 'ollama'])
    for (const provider of PROVIDERS) {
      if (!provider.local) expect(provider.keyUrl ?? provider.docUrl).toMatch(/^https:\/\//)
    }
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
