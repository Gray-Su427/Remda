import { useEffect, useState } from 'react'
import { readErrorMessage } from '@shared/errors'
import type { ThemeMode } from '@shared/types'
import { useSettingsStore } from '../stores/settingsStore'
import '../styles/settings.css'

export function SettingsDialog() {
  const { settings, open, setOpen, save } = useSettingsStore()
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0.3)
  const [maxContextChars, setMaxContextChars] = useState(24000)
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!settings) return
    setBaseUrl(settings.baseUrl)
    setModel(settings.model)
    setTemperature(settings.temperature)
    setMaxContextChars(settings.maxContextChars)
    setTheme(settings.theme)
  }, [settings, open])

  if (!open) return null

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

        <label htmlFor="settings-base-url">Base URL</label>
        <input id="settings-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <p className="hint">例如 https://api.deepseek.com/v1 或 http://localhost:11434/v1</p>

        <label htmlFor="settings-model">模型</label>
        <input id="settings-model" value={model} onChange={(e) => setModel(e.target.value)} />

        <label htmlFor="settings-key">API Key</label>
        <input
          id="settings-key"
          type="password"
          placeholder={settings?.hasApiKey ? `已保存：${settings.apiKeyHint}` : '尚未设置'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="hint">留空表示保持现有 Key 不变；Key 加密保存在本机。</p>

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
