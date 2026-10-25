import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemdaApi } from '@shared/api'
import { defaultSettings, mockRemda } from '../test/mockRemda'
import { useSettingsStore } from '../stores/settingsStore'
import { CUSTOM_PROVIDER_LABEL } from './ProviderPicker'
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

  it('fills the model and hides the base url when a provider is selected', async () => {
    const save = vi.fn(async () => defaultSettings)
    Object.defineProperty(window, 'remda', { value: withSettings({ save }), configurable: true })
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /OpenAI/ }))

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument()
    expect(screen.getByLabelText('模型')).toHaveValue('gpt-5.4-mini')

    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-5.4-mini'
        })
      )
    )
  })

  it('shows the base url input only in custom mode', async () => {
    const save = vi.fn(async () => defaultSettings)
    Object.defineProperty(window, 'remda', { value: withSettings({ save }), configurable: true })
    render(<SettingsDialog />)

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(
      screen.getByRole('option', { name: new RegExp(CUSTOM_PROVIDER_LABEL) })
    )

    const baseUrl = screen.getByLabelText('Base URL')
    expect(baseUrl).toHaveValue('https://api.deepseek.com/v1')
    await userEvent.clear(baseUrl)
    await userEvent.type(baseUrl, 'https://example.com/v1')
    expect(screen.getByRole('combobox', { name: '服务商' })).toHaveTextContent(
      CUSTOM_PROVIDER_LABEL
    )

    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'https://example.com/v1' })
      )
    )
  })

  it('restores custom mode for a base url that is not a preset', async () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, baseUrl: 'https://example.com/v1' }
    })
    Object.defineProperty(window, 'remda', { value: withSettings({}), configurable: true })
    render(<SettingsDialog />)

    expect(await screen.findByLabelText('Base URL')).toHaveValue('https://example.com/v1')
    expect(screen.getByRole('combobox', { name: '服务商' })).toHaveTextContent(
      CUSTOM_PROVIDER_LABEL
    )
  })

  it('opens the provider key page externally', async () => {
    const api = withSettings({})
    Object.defineProperty(window, 'remda', { value: api, configurable: true })
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('button', { name: '获取 API Key' }))
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://platform.deepseek.com/api_keys')
  })

  it('hints that local providers work without a key', async () => {
    Object.defineProperty(window, 'remda', { value: withSettings({}), configurable: true })
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.type(screen.getByLabelText('搜索服务商'), 'ollama')
    await userEvent.click(screen.getByRole('option', { name: /Ollama/ }))

    expect(screen.getByText(/本地服务无需 API Key/)).toBeInTheDocument()
    expect(screen.getByLabelText('模型')).toHaveValue('qwen3:8b')
  })
})
