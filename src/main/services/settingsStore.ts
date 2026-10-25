import { readFile } from 'node:fs/promises'
import { AppError } from '@shared/errors'
import { baseUrlKey } from '@shared/providers'
import type { PublicSettings, SettingsInput } from '@shared/types'
import { writeJsonAtomic } from './atomicWrite'

export interface SecretBox {
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

interface SettingsFileV1 {
  version: 1
  settings: SettingsInput
  apiKeyEnc: string | null
}

interface SettingsFileV2 {
  version: 2
  settings: Omit<SettingsInput, 'apiKey'>
  /** 规范化 baseUrl -> 加密后的 Key；只保存非空条目 */
  apiKeys: Record<string, string>
}

interface LoadedSettings {
  settings: SettingsInput
  keys: Record<string, string>
}

export const DEFAULT_SETTINGS: SettingsInput = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxContextChars: 24000,
  theme: 'system',
  apiKey: ''
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readKeys = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}
  const keys: Record<string, string> = {}
  for (const [endpoint, cipher] of Object.entries(value)) {
    if (typeof cipher !== 'string' || !cipher) continue
    const key = baseUrlKey(endpoint)
    if (key) keys[key] = cipher
  }
  return keys
}

const mask = (key: string): string =>
  key.length <= 8 ? '••••' : `${key.slice(0, 3)}••••${key.slice(-4)}`

export class SettingsStore {
  constructor(
    private readonly file: string,
    private readonly box: SecretBox | null
  ) {}

  async load(): Promise<SettingsInput> {
    const { settings, keys } = await this.loadFile()
    return { ...settings, apiKey: this.decryptKey(keys[baseUrlKey(settings.baseUrl)] ?? null) }
  }

  /** 设置界面使用：只暴露当前 Key 与各地址的掩码提示，不含明文。 */
  async getPublic(): Promise<PublicSettings> {
    const { settings, keys } = await this.loadFile()
    const apiKey = this.decryptKey(keys[baseUrlKey(settings.baseUrl)] ?? null)
    return this.toPublic({ ...settings, apiKey }, keys)
  }

  async save(patch: Partial<SettingsInput>): Promise<PublicSettings> {
    const { settings: current, keys: currentKeys } = await this.loadFile()
    const next: SettingsInput = {
      ...current,
      ...patch,
      apiKey: ''
    }
    if (!next.baseUrl.startsWith('http')) {
      throw new AppError('SETTINGS_BAD_URL', 'baseURL 必须以 http:// 或 https:// 开头')
    }
    if (!(next.temperature >= 0 && next.temperature <= 2)) {
      throw new AppError('SETTINGS_BAD_TEMPERATURE', 'temperature 必须在 0 到 2 之间')
    }

    const keys = { ...currentKeys }
    const endpoint = baseUrlKey(next.baseUrl)
    if (patch.apiKey !== undefined) {
      const trimmed = patch.apiKey.trim()
      if (trimmed) keys[endpoint] = this.encryptKey(trimmed)
      else delete keys[endpoint]
    }
    for (const [key, cipher] of Object.entries(keys)) {
      if (!cipher) delete keys[key]
    }

    await this.persist(next, keys)
    const apiKey = this.decryptKey(keys[endpoint] ?? null)
    return this.toPublic({ ...next, apiKey }, keys)
  }

  toPublic(settings: SettingsInput, keys: Record<string, string> = {}): PublicSettings {
    const { apiKey, ...rest } = settings
    const apiKeyHints: Record<string, string> = {}
    for (const [endpoint, cipher] of Object.entries(keys)) {
      const plain = this.decryptKey(cipher)
      if (plain) apiKeyHints[endpoint] = mask(plain)
    }
    return {
      ...rest,
      hasApiKey: apiKey.length > 0,
      apiKeyHint: apiKey ? mask(apiKey) : '',
      apiKeyHints
    }
  }

  /** 按 Base URL 取 Key；设置界面切换供应商、测试连接时使用。 */
  async resolveApiKey(baseUrl: string): Promise<string> {
    const { keys } = await this.loadFile()
    return this.decryptKey(keys[baseUrlKey(baseUrl)] ?? null)
  }

  private async loadFile(): Promise<LoadedSettings> {
    const raw = await readFile(this.file, 'utf8').catch(() => null)
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, keys: {} }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, keys: {} }
    }
    if (!isRecord(parsed)) return { settings: { ...DEFAULT_SETTINGS }, keys: {} }

    const rawSettings = isRecord(parsed.settings) ? parsed.settings : {}
    const settings: SettingsInput = {
      ...DEFAULT_SETTINGS,
      ...(rawSettings as Partial<SettingsInput>),
      apiKey: ''
    }

    if (parsed.version === 2) {
      return { settings, keys: readKeys(parsed.apiKeys) }
    }

    // v1：旧的单一 Key 归到当前 baseUrl 下；其他供应商需要重新填写一次。
    const keys: Record<string, string> = {}
    const legacyFile = parsed as Partial<SettingsFileV1>
    const legacy = legacyFile.apiKeyEnc
    if (typeof legacy === 'string' && legacy) {
      const endpoint = baseUrlKey(settings.baseUrl)
      if (endpoint) keys[endpoint] = legacy
    }
    return { settings, keys }
  }

  private async persist(settings: SettingsInput, keys: Record<string, string>): Promise<void> {
    const { apiKey, ...rest } = settings
    const payload: SettingsFileV2 = {
      version: 2,
      settings: rest,
      apiKeys: keys
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
