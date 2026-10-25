import { describe, expect, it } from 'vitest'
import {
  isLoopbackBaseUrl,
  matchProviderByBaseUrl,
  PROVIDERS,
  searchProviders
} from './providers'

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

  it('only local presets skip the api key', () => {
    const local = PROVIDERS.filter((provider) => provider.local).map((provider) => provider.id)
    expect(local).toEqual(['ollama', 'lmstudio'])
    for (const provider of PROVIDERS) {
      if (!provider.local) expect(provider.keyUrl).toMatch(/^https:\/\//)
    }
  })
})

describe('searchProviders', () => {
  it('returns everything for an empty query', () => {
    expect(searchProviders('')).toHaveLength(PROVIDERS.length)
    expect(searchProviders('   ')).toHaveLength(PROVIDERS.length)
  })

  it('matches english names and ids case-insensitively', () => {
    expect(searchProviders('DEEP').map((provider) => provider.id)).toContain('deepseek')
    expect(searchProviders('openrouter').map((provider) => provider.id)).toEqual(['openrouter'])
  })

  it('matches chinese aliases', () => {
    expect(searchProviders('深度求索').map((provider) => provider.id)).toEqual(['deepseek'])
    expect(searchProviders('硅基流动').map((provider) => provider.id)).toEqual(['siliconflow'])
    expect(searchProviders('月之暗面').map((provider) => provider.id)).toEqual(['moonshot'])
  })

  it('requires every whitespace-separated term to match', () => {
    expect(searchProviders('本地 ollama').map((provider) => provider.id)).toEqual(['ollama'])
    expect(searchProviders('本地 openrouter')).toEqual([])
  })

  it('returns an empty list when nothing matches', () => {
    expect(searchProviders('no-such-provider')).toEqual([])
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
