import { useEffect, useState } from 'react'
import { readErrorMessage } from '@shared/errors'
import { matchProviderByBaseUrl, PROVIDERS } from '@shared/providers'
import type { ThemeMode } from '@shared/types'
import { useSettingsStore } from '../stores/settingsStore'
import { ProviderPicker } from './ProviderPicker'
import '../styles/settings.css'

export function SettingsDialog() {
  const { settings, open, setOpen, save } = useSettingsStore()
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0.3)
  const [maxContextChars, setMaxContextChars] = useState(24000)
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!settings) return
    setBaseUrl(settings.baseUrl)
    setModel(settings.model)
    setTemperature(settings.temperature)
    setMaxContextChars(settings.maxContextChars)
    setTheme(settings.theme)
    setSelectedId(matchProviderByBaseUrl(settings.baseUrl)?.id ?? null)
  }, [settings, open])

  if (!open) return null

  const selectedProvider = selectedId
    ? (PROVIDERS.find((provider) => provider.id === selectedId) ?? null)
    : null
  const keyUrl = selectedProvider?.keyUrl

  const submit = async (): Promise<void> => {
    setBusy(true)
    setStatus(null)
    try {
      await save({
        baseUrl,
        model,
        temperature,
        maxContextChars,
        theme,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
      })
      setApiKey('')
      setStatus('已保存')
    } catch (error) {
      setStatus(readErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const test = async (): Promise<void> => {
    setStatus('测试中…')
    const result = await window.remda.settings.test({
      baseUrl,
      model,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
    })
    setStatus(result.ok ? '连接成功' : (result.error ?? '连接失败'))
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-label="设置"
        data-testid="settings-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>设置</h2>

        <label htmlFor="settings-provider">服务商</label>
        <ProviderPicker
          id="settings-provider"
          selectedId={selectedId}
          onSelect={(provider) => {
            setStatus(null)
            if (!provider) {
              setSelectedId(null)
              return
            }
            setSelectedId(provider.id)
            setBaseUrl(provider.baseUrl)
            setModel(provider.defaultModel)
          }}
        />
        <p className="hint">
          {selectedProvider
            ? selectedProvider.local
              ? '本地服务无需 API Key，模型请填本机已下载/已加载的模型名。'
              : `已选择 ${selectedProvider.name}，默认模型已填好，只需填写 API Key。`
            : '手动填写 Base URL 与模型；也可以从上方重新选择服务商。'}
        </p>

        {!selectedProvider && (
          <>
            <label htmlFor="settings-base-url">Base URL</label>
            <input
              id="settings-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </>
        )}

        <label htmlFor="settings-model">模型</label>
        <input id="settings-model" value={model} onChange={(e) => setModel(e.target.value)} />

        <div className="field-label">
          <label htmlFor="settings-key">API Key</label>
          {keyUrl && (
            <button
              type="button"
              className="btn btn--link"
              onClick={() => void window.remda.shell.openExternal(keyUrl)}
            >
              获取 API Key
            </button>
          )}
        </div>
        <input
          id="settings-key"
          type="password"
          placeholder={
            settings?.hasApiKey
              ? `已保存：${settings.apiKeyHint}`
              : selectedProvider?.local
                ? '本地服务可留空'
                : '尚未设置'
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="hint">
          {selectedProvider?.local && !settings?.hasApiKey
            ? '本地服务通常不需要 Key；若服务端开启了鉴权再填写。'
            : '留空表示保持现有 Key 不变；Key 加密保存在本机。'}
        </p>

        <label htmlFor="settings-temperature">温度（0–2）</label>
        <input
          id="settings-temperature"
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
        />

        <label htmlFor="settings-budget">上下文预算（字符）</label>
        <input
          id="settings-budget"
          type="number"
          min={800}
          step={1000}
          value={maxContextChars}
          onChange={(e) => setMaxContextChars(Number(e.target.value))}
        />

        <label htmlFor="settings-theme">主题</label>
        <select
          id="settings-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeMode)}
        >
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>

        {status && <p className="status">{status}</p>}

        <div className="modal__actions">
          <button type="button" className="btn" onClick={() => void test()}>
            测试连接
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
