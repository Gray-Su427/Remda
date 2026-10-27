import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemdaApi } from '@shared/api'
import type { ModelCatalogSnapshot } from '@shared/types'
import { defaultSettings, mockRemda } from '../test/mockRemda'
import { useSettingsStore } from '../stores/settingsStore'
import { CUSTOM_PROVIDER_LABEL } from './ProviderPicker'
import { SettingsDialog } from './SettingsDialog'

function withSettings(overrides: Partial<RemdaApi['settings']>): RemdaApi {
  const base = mockRemda()
  return { ...base, settings: { ...base.settings, ...overrides } }
}

function withCatalog(catalog: ModelCatalogSnapshot, refresh = catalog): RemdaApi {
  return mockRemda({
    catalog: {
      get: vi.fn(async () => catalog),
      refresh: vi.fn(async () => refresh)
    }
  })
}

function install(api: RemdaApi): RemdaApi {
  Object.defineProperty(window, 'remda', { value: api, configurable: true })
  return api
}

beforeEach(() => {
  useSettingsStore.setState({ settings: defaultSettings, open: true, loading: false })
})

describe('SettingsDialog', () => {
  it('saves the model picked from the list', async () => {
    const save = vi.fn(async () => defaultSettings)
    install(withSettings({ save }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    await userEvent.click(screen.getByRole('option', { name: /deepseek-v4-pro/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-v4-pro' }))
    )
  })

  it('keeps the key when the key field is left empty', async () => {
    const save = vi.fn(async () => defaultSettings)
    install(withSettings({ save }))
    render(<SettingsDialog />)
    expect(screen.getByLabelText('API Key')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('sk-••••1234')
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect((save.mock.calls[0] as unknown[])[0]).not.toHaveProperty('apiKey')
  })

  it('switches the key hint when the provider changes', async () => {
    useSettingsStore.setState({
      settings: {
        ...defaultSettings,
        apiKeyHints: {
          'https://api.deepseek.com/v1': 'sk-••••1111',
          'https://api.openai.com/v1': 'sk-••••2222'
        }
      }
    })
    install(withSettings({}))
    render(<SettingsDialog />)

    const key = screen.getByLabelText('API Key')
    expect(key).toHaveAttribute('placeholder', '已保存：sk-••••1111')

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /OpenAI/ }))
    expect(key).toHaveAttribute('placeholder', '已保存：sk-••••2222')

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /Cerebras/ }))
    expect(key).toHaveAttribute('placeholder', '尚未设置')
  })

  it('clears a typed key when switching providers', async () => {
    install(withSettings({}))
    render(<SettingsDialog />)

    const key = screen.getByLabelText('API Key')
    await userEvent.type(key, 'sk-typed-1234')
    expect(key).toHaveValue('sk-typed-1234')

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /OpenAI/ }))
    expect(key).toHaveValue('')
  })

  it('saves a key under the newly selected provider', async () => {
    const save = vi.fn(async () => defaultSettings)
    install(withSettings({ save }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /OpenAI/ }))
    await userEvent.type(screen.getByLabelText('API Key'), 'sk-openai-new')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-openai-new'
        })
      )
    )
  })

  it('shows the connection test result', async () => {
    install(withSettings({ test: vi.fn(async () => ({ ok: false, error: 'API Key 无效或无权限' })) }))
    render(<SettingsDialog />)
    await userEvent.click(screen.getByRole('button', { name: '测试连接' }))
    expect(await screen.findByText('API Key 无效或无权限')).toBeInTheDocument()
  })

  it('fills the model and hides the base url when a provider is selected', async () => {
    const save = vi.fn(async () => defaultSettings)
    install(withSettings({ save }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /OpenAI/ }))

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveTextContent(/GPT-5\.4 mini/i)

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

  it('supports a custom model id', async () => {
    const save = vi.fn(async () => defaultSettings)
    install(withSettings({ save }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    await userEvent.click(screen.getByRole('option', { name: /自定义模型/ }))

    const input = screen.getByLabelText('模型 ID')
    expect(input).toHaveValue('deepseek-chat')
    await userEvent.clear(input)
    await userEvent.type(input, 'deepseek-reasoner')

    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'deepseek-reasoner' })
      )
    )
  })

  it('uses models from the downloaded catalog', async () => {
    const save = vi.fn(async () => defaultSettings)
    const catalog: ModelCatalogSnapshot = {
      updatedAt: 1_700_000_000_000,
      checkedAt: Date.now(),
      providers: { deepseek: [{ id: 'deepseek-v99', name: 'DeepSeek V99' }] }
    }
    install({ ...withCatalog(catalog), settings: { ...mockRemda().settings, save } })
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    await userEvent.click(screen.getByRole('option', { name: /DeepSeek V99/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-v99' }))
    )
  })

  it('keeps a saved model that is missing from the list', async () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, model: 'my-custom-model' }
    })
    const catalog: ModelCatalogSnapshot = {
      updatedAt: null,
      checkedAt: Date.now(),
      providers: {}
    }
    install(withCatalog(catalog))
    render(<SettingsDialog />)

    expect(screen.getByRole('combobox', { name: '模型' })).toHaveTextContent('my-custom-model')
    await userEvent.click(screen.getByRole('combobox', { name: '模型' }))
    expect(screen.getByRole('option', { name: /my-custom-model/ })).toBeInTheDocument()
    expect(screen.getByText('已保存')).toBeInTheDocument()
  })

  it('shows the base url input only in custom provider mode', async () => {
    const save = vi.fn(async () => defaultSettings)
    install(withSettings({ save }))
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

  it('restores custom provider mode for a base url that is not a preset', async () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, baseUrl: 'https://example.com/v1' }
    })
    install(withSettings({}))
    render(<SettingsDialog />)

    expect(await screen.findByLabelText('Base URL')).toHaveValue('https://example.com/v1')
    expect(screen.getByRole('combobox', { name: '服务商' })).toHaveTextContent(
      CUSTOM_PROVIDER_LABEL
    )
  })

  it('refreshes a stale catalog when opened', async () => {
    const get = vi.fn(async () => ({
      updatedAt: null,
      checkedAt: null,
      providers: {}
    }))
    const refresh = vi.fn(async () => ({
      updatedAt: 123,
      checkedAt: 123,
      providers: {}
    }))
    install(mockRemda({ catalog: { get, refresh } }))
    render(<SettingsDialog />)

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('refreshes the catalog on demand', async () => {
    const refresh = vi.fn(async () => ({
      updatedAt: 123,
      checkedAt: Date.now(),
      providers: {}
    }))
    install(mockRemda({ catalog: { get: vi.fn(async () => ({
      updatedAt: null,
      checkedAt: Date.now(),
      providers: {}
    })), refresh } }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('button', { name: '刷新列表' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('opens the provider key page externally', async () => {
    const api = install(withSettings({}))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('button', { name: '获取 API Key' }))
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://platform.deepseek.com/api_keys')
  })

  it('passes the coding plan models url when testing', async () => {
    const test = vi.fn(async () => ({ ok: true }))
    install(withSettings({ test }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /OpenCode Go/ }))
    await userEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() =>
      expect(test).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://opencode.ai/inference/go/openai/v1',
          modelsUrl: 'https://opencode.ai/inference/go/v1/models'
        })
      )
    )
  })

  it('shows a docs link when the provider has no key page', async () => {
    const api = install(withSettings({}))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.click(screen.getByRole('option', { name: /Cerebras/ }))
    await userEvent.click(screen.getByRole('button', { name: '查看文档' }))

    expect(api.shell.openExternal).toHaveBeenCalledWith(
      'https://inference-docs.cerebras.ai/models/overview'
    )
  })

  it('hints that local providers work without a key', async () => {
    install(withSettings({}))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('combobox', { name: '服务商' }))
    await userEvent.type(screen.getByLabelText('搜索服务商'), '11434')
    await userEvent.click(screen.getByRole('option', { name: /Ollama/ }))

    expect(screen.getByText(/本地服务无需 API Key/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveTextContent('Qwen3 8B')
  })

  it('rejects saving an empty model', async () => {
    const save = vi.fn(async () => defaultSettings)
    useSettingsStore.setState({ settings: { ...defaultSettings, model: '' } })
    install(withSettings({ save }))
    render(<SettingsDialog />)

    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('请选择或填写模型')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })
})
