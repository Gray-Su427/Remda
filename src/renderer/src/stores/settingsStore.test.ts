import { describe, expect, it, vi } from 'vitest'
import { installMockRemda, defaultSettings } from '../test/mockRemda'
import { useSettingsStore } from './settingsStore'

describe('settingsStore', () => {
  it('loads public settings and applies the theme', async () => {
    installMockRemda()
    await useSettingsStore.getState().load()
    expect(useSettingsStore.getState().settings).toEqual(defaultSettings)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('surfaces save errors', async () => {
    const api = installMockRemda()
    api.settings.save = vi.fn(async () => {
      throw { code: 'SETTINGS_BAD_URL', message: 'baseURL 必须以 http:// 或 https:// 开头' }
    })
    await expect(useSettingsStore.getState().save({ baseUrl: 'x' })).rejects.toMatchObject({
      message: 'baseURL 必须以 http:// 或 https:// 开头'
    })
  })
})
