import { describe, expect, it } from 'vitest'
import { isLoopbackBaseUrl, matchProviderByBaseUrl, PROVIDERS } from './providers'

describe('PROVIDERS', () => {
  it('has unique ids and usable endpoints', () => {
    const ids = PROVIDERS.map((provider) => provider.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const provider of PROVIDERS) {
      expect(provider.name.length).toBeGreaterThan(0)
      expect(provider.defaultModel.length).toBeGreaterThan(0)
      expect(provider.baseUrl).toMatch(/^https?:\/\//)
      expect(() => new URL(provider.baseUrl)).not.toThrow()
    }
  })

  it('ships a non-empty, unique model list containing the default model', () => {
    for (const provider of PROVIDERS) {
      expect(provider.models.length).toBeGreaterThan(0)
      expect(new Set(provider.models).size).toBe(provider.models.length)
      expect(provider.models).toContain(provider.defaultModel)
    }
  })

  it('only local presets skip the api key', () => {
    const local = PROVIDERS.filter((provider) => provider.local).map((provider) => provider.id)
    expect(local).toEqual(['ollama', 'lmstudio'])
    for (const provider of PROVIDERS) {
      if (!provider.local) expect(provider.keyUrl).toMatch(/^https:\/\//)
    }
  })
})

describe('matchProviderByBaseUrl', () => {
  it('ignores case and trailing slashes', () => {
    expect(matchProviderByBaseUrl(' https://API.DeepSeek.com/v1/// ')?.id).toBe('deepseek')
  })

  it('returns null for custom urls', () => {
    expect(matchProviderByBaseUrl('https://example.com/v1')).toBeNull()
    expect(matchProviderByBaseUrl('')).toBeNull()
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
