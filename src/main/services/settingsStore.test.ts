/** @vitest-environment node */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore, type SecretBox } from './settingsStore'

const box: SecretBox = {
  encrypt: (plain) => Buffer.from(`enc:${plain}`).toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8').replace(/^enc:/, '')
}

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
  })

  it('round-trips and merges patches', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ model: 'deepseek-reasoner', temperature: 0.5 })
    const loaded = await store.load()
    expect(loaded.model).toBe('deepseek-reasoner')
    expect(loaded.temperature).toBe(0.5)
    expect(loaded.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
  })

  it('never exposes the plaintext key through toPublic', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-secret-123456' })
    const pub = store.toPublic(await store.load())
    expect(JSON.stringify(pub)).not.toContain('sk-secret-123456')
    expect(pub.hasApiKey).toBe(true)
    expect(pub.apiKeyHint).toBe('sk-••••3456')
  })

  it('persists the key encrypted, not in plaintext', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-secret-123456' })
    const raw = await readFile(file, 'utf8')
    expect(raw).not.toContain('sk-secret-123456')
    expect(await store.resolveApiKey()).toBe('sk-secret-123456')
  })

  it('keeps the existing key when a patch omits it', async () => {
    const store = new SettingsStore(file, box)
    await store.save({ apiKey: 'sk-abc-9999' })
    await store.save({ model: 'x' })
    expect(await store.resolveApiKey()).toBe('sk-abc-9999')
  })

  it('works without encryption available (plaintext fallback)', async () => {
    const store = new SettingsStore(file, null)
    await store.save({ apiKey: 'sk-plain-0000' })
    expect(await store.resolveApiKey()).toBe('sk-plain-0000')
  })
})
