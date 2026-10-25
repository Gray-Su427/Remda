import { readFile } from 'node:fs/promises'
import { AppError } from '@shared/errors'
import type { PublicSettings, SettingsInput } from '@shared/types'
import { writeJsonAtomic } from './atomicWrite'

export interface SecretBox {
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

interface SettingsFile {
  version: 1
  settings: SettingsInput
  apiKeyEnc: string | null
}

export const DEFAULT_SETTINGS: SettingsInput = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxContextChars: 24000,
  theme: 'system',
  apiKey: ''
}

const mask = (key: string): string =>
  key.length <= 8 ? '••••' : `${key.slice(0, 3)}••••${key.slice(-4)}`

export class SettingsStore {
  constructor(
    private readonly file: string,
    private readonly box: SecretBox | null
  ) {}

  async load(): Promise<SettingsInput> {
    const raw = await readFile(this.file, 'utf8').catch(() => null)
    if (!raw) return { ...DEFAULT_SETTINGS }
    let parsed: SettingsFile
    try {
      parsed = JSON.parse(raw) as SettingsFile
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
    const apiKey = this.decryptKey(parsed.apiKeyEnc)
    return { ...DEFAULT_SETTINGS, ...parsed.settings, apiKey }
  }

  async save(patch: Partial<SettingsInput>): Promise<PublicSettings> {
    const current = await this.load()
    const next: SettingsInput = {
      ...current,
      ...patch,
      apiKey: patch.apiKey === undefined ? current.apiKey : patch.apiKey.trim()
    }
    if (!next.baseUrl.startsWith('http')) {
      throw new AppError('SETTINGS_BAD_URL', 'baseURL 必须以 http:// 或 https:// 开头')
    }
    if (!(next.temperature >= 0 && next.temperature <= 2)) {
      throw new AppError('SETTINGS_BAD_TEMPERATURE', 'temperature 必须在 0 到 2 之间')
    }
    await this.persist(next)
    return this.toPublic(next)
  }

  toPublic(settings: SettingsInput): PublicSettings {
    const { apiKey, ...rest } = settings
    return {
      ...rest,
      hasApiKey: apiKey.length > 0,
      apiKeyHint: apiKey ? mask(apiKey) : ''
    }
  }

  async resolveApiKey(): Promise<string> {
    return (await this.load()).apiKey
  }

  private async persist(settings: SettingsInput): Promise<void> {
    const { apiKey, ...rest } = settings
    const payload: SettingsFile = {
      version: 1,
      settings: { ...rest, apiKey: '' },
      apiKeyEnc: apiKey ? this.encryptKey(apiKey) : null
    }
    await writeJsonAtomic(this.file, payload)
  }

  private encryptKey(plain: string): string {
    if (!this.box) return `plain:${plain}`
    return `enc:${this.box.encrypt(plain)}`
  }

  private decryptKey(value: string | null): string {
    if (!value) return ''
    if (value.startsWith('plain:')) return value.slice(6)
    if (value.startsWith('enc:') && this.box) {
      try {
        return this.box.decrypt(value.slice(4))
      } catch {
        return ''
      }
    }
    return ''
  }
}
