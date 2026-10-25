/** @vitest-environment node */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseUrlKey } from '@shared/providers'
import { DEFAULT_SETTINGS, SettingsStore, type SecretBox } from './settingsStore'

const box: SecretBox = {
  encrypt: (plain) => Buffer.from(`enc:${plain}`).toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8').replace(/^enc:/, '')
}

const DEEPSEEK = baseUrlKey('https://api.deepseek.com/v1')
const OPENAI = baseUrlKey('https://api.openai.com/v1')

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'remda-settings-'))
  file = join(dir, 'settings.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  it('returns defaults when the file is missing', async () => {
    const store = new SettingsStore(file, box)
    await expect(store.load()).resolves.toEqual(DEFAULT_SETTINGS)
    await expect(store.getPublic()).resolves.toMatchObject({
      hasApiKey: false,
      apiKeyHint: '',
      apiKeyHints: {}
    })
  })

  it('round-trips and merges patches', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ model: 'deepseek-reasoner', temperature: 0.5 })
    const loaded = await store.load()
    expect(loaded.model).toBe('deepseek-reasoner')
    expect(loaded.temperature).toBe(0.5)
    expect(loaded.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
  })

  it('never exposes the plaintext key through getPublic', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-secret-123456' })
    const pub = await store.getPublic()
    expect(JSON.stringify(pub)).not.toContain('sk-secret-123456')
    expect(pub.hasApiKey).toBe(true)
    expect(pub.apiKeyHint).toBe('sk-••••3456')
    expect(pub.apiKeyHints[DEEPSEEK]).toBe('sk-••••3456')
  })

  it('persists each key encrypted under its own base url', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-deepseek-1111' })
    await store.save({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-2222'
    })

    expect(await store.resolveApiKey('https://api.deepseek.com/v1')).toBe('sk-deepseek-1111')
    expect(await store.resolveApiKey('https://api.openai.com/v1')).toBe('sk-openai-2222')
    expect(await store.resolveApiKey('https://api.siliconflow.cn/v1')).toBe('')

    const loaded = await store.load()
    expect(loaded.baseUrl).toBe('https://api.openai.com/v1')
    expect(loaded.apiKey).toBe('sk-openai-2222')

    const pub = await store.getPublic()
    expect(pub.apiKeyHints[DEEPSEEK]).toBe('sk-••••1111')
    expect(pub.apiKeyHints[OPENAI]).toBe('sk-••••2222')
    expect(JSON.stringify(pub)).not.toContain('sk-deepseek-1111')
  })

  it('does not persist keys for providers that never received one', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-deepseek-1111' })
    await store.save({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.4-mini' })

    const raw = JSON.parse(await readFile(file, 'utf8')) as {
      version: number
      apiKeys: Record<string, string>
    }
    expect(raw.version).toBe(2)
    expect(Object.keys(raw.apiKeys)).toEqual([DEEPSEEK])
  })

  it('removes the key when an empty key is saved', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-deepseek-1111' })
    await store.save({ apiKey: '' })

    expect(await store.resolveApiKey('https://api.deepseek.com/v1')).toBe('')
    const raw = JSON.parse(await readFile(file, 'utf8')) as { apiKeys: Record<string, string> }
    expect(raw.apiKeys[DEEPSEEK]).toBeUndefined()
  })

  it('keeps the existing key when a patch omits it', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-abc-9999' })
    await store.save({ model: 'x' })
    expect(await store.resolveApiKey(DEFAULT_SETTINGS.baseUrl)).toBe('sk-abc-9999')
  })

  it('normalizes base urls when looking up keys', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-normal-5555' })
    expect(await store.resolveApiKey(' https://API.DeepSeek.com/v1/// ')).toBe('sk-normal-5555')
  })

  it('migrates a v1 file to the current base url', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        settings: { ...DEFAULT_SETTINGS, apiKey: '' },
        apiKeyEnc: 'plain:sk-legacy-7777'
      }),
      'utf8'
    )
    const store = new SettingsStore(file, null)

    expect(await store.load()).toMatchObject({ apiKey: 'sk-legacy-7777' })
    const pub = await store.getPublic()
    expect(pub.apiKeyHints[DEEPSEEK]).toBe('sk-••••7777')

    await store.save({ baseUrl: 'https://api.openai.com/v1' })
    const raw = JSON.parse(await readFile(file, 'utf8')) as {
      version: number
      apiKeys: Record<string, string>
    }
    expect(raw.version).toBe(2)
    expect(raw.apiKeys[DEEPSEEK]).toBe('plain:sk-legacy-7777')
    expect(raw.apiKeys[OPENAI]).toBeUndefined()
  })

  it('works without encryption available (plaintext fallback)', async () => {
    const store = new SettingsStore(file, null)
    await store.save({ apiKey: 'sk-plain-0000' })
    expect(await store.resolveApiKey(DEFAULT_SETTINGS.baseUrl)).toBe('sk-plain-0000')
  })
})
