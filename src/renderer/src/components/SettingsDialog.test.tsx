import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemdaApi } from '@shared/api'
import { defaultSettings, mockRemda } from '../test/mockRemda'
import { useSettingsStore } from '../stores/settingsStore'
import { SettingsDialog } from './SettingsDialog'

function withSettings(overrides: Partial<RemdaApi['settings']>): RemdaApi {
  const base = mockRemda()
  return { ...base, settings: { ...base.settings, ...overrides } }
}

beforeEach(() => {
  useSettingsStore.setState({ settings: defaultSettings, open: true, loading: false })
})

describe('SettingsDialog', () => {
  it('saves edited fields', async () => {
    const save = vi.fn(async () => defaultSettings)
    Object.defineProperty(window, 'remda', { value: withSettings({ save }), configurable: true })
    render(<SettingsDialog />)

    const model = screen.getByLabelText('模型')
    await userEvent.clear(model)
    await userEvent.type(model, 'deepseek-reasoner')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-reasoner' }))
    )
  })

  it('keeps the key when the key field is left empty', async () => {
    const save = vi.fn(async () => defaultSettings)
    Object.defineProperty(window, 'remda', { value: withSettings({ save }), configurable: true })
    render(<SettingsDialog />)
    expect(screen.getByLabelText('API Key')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('sk-••••1234')
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect((save.mock.calls[0] as unknown[])[0]).not.toHaveProperty('apiKey')
  })

  it('shows the connection test result', async () => {
    Object.defineProperty(window, 'remda', {
      value: withSettings({ test: vi.fn(async () => ({ ok: false, error: 'API Key 无效或无权限' })) }),
      configurable: true
    })
    render(<SettingsDialog />)
    await userEvent.click(screen.getByRole('button', { name: '测试连接' }))
    expect(await screen.findByText('API Key 无效或无权限')).toBeInTheDocument()
  })
})
