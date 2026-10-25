import { vi } from 'vitest'
import type { RemdaApi } from '@shared/api'
import type { FileNode, ModelCatalogSnapshot, PublicSettings } from '@shared/types'

export const defaultSettings: PublicSettings = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.3,
  maxContextChars: 24000,
  theme: 'light',
  hasApiKey: true,
  apiKeyHint: 'sk-••••1234'
}

export const demoTree: FileNode = {
  kind: 'dir',
  name: 'docs',
  path: 'D:/docs',
  children: [
    {
      kind: 'dir',
      name: 'ch01',
      path: 'D:/docs/ch01',
      children: [{ kind: 'file', name: '1.1.md', path: 'D:/docs/ch01/1.1.md', size: 120 }]
    },
    { kind: 'file', name: 'README.md', path: 'D:/docs/README.md', size: 80 }
  ]
}

export const emptyCatalog = (): ModelCatalogSnapshot => ({
  updatedAt: null,
  checkedAt: Date.now(),
  providers: {}
})

export function mockRemda(overrides: Partial<RemdaApi> = {}): RemdaApi {
  const api: RemdaApi = {
    fs: {
      pickFolder: vi.fn(async () => 'D:/docs'),
      pickFile: vi.fn(async () => 'D:/docs/README.md'),
      readTree: vi.fn(async () => demoTree),
      readDocument: vi.fn(async (path: string) => ({
        path,
        name: path.split('/').pop() ?? 'a.md',
        content: '# README\n\n正文\n',
        mtimeMs: 1,
        size: 80
      })),
      watch: vi.fn(async () => {}),
      unwatch: vi.fn(async () => {}),
      onChanged: vi.fn(() => () => {})
    },
    settings: {
      get: vi.fn(async () => defaultSettings),
      save: vi.fn(async () => defaultSettings),
      test: vi.fn(async () => ({ ok: true }))
    },
    catalog: {
      get: vi.fn(async () => emptyCatalog()),
      refresh: vi.fn(async () => emptyCatalog())
    },
    chat: {
      start: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      onEvent: vi.fn(() => () => {})
    },
    conversations: {
      load: vi.fn(async () => []),
      save: vi.fn(async () => {}),
      clear: vi.fn(async () => {})
    },
    shell: { openExternal: vi.fn(async () => {}) },
    app: { getBootstrap: vi.fn(async () => ({})) }
  }
  return { ...api, ...overrides }
}

export function installMockRemda(overrides: Partial<RemdaApi> = {}): RemdaApi {
  const api = mockRemda(overrides)
  Object.defineProperty(window, 'remda', { value: api, configurable: true, writable: true })
  return api
}
