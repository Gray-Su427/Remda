import { useEffect, useMemo, useState } from 'react'
import { readErrorMessage } from '@shared/errors'
import { baseUrlKey, matchProviderByBaseUrl, PROVIDERS } from '@shared/providers'
import type { CatalogModel, ModelCatalogSnapshot, ThemeMode } from '@shared/types'
import { useSettingsStore } from '../stores/settingsStore'
import { ModelPicker } from './ModelPicker'
import { ProviderPicker } from './ProviderPicker'
import '../styles/settings.css'

/** 超过这个时间没有检查过模型目录，打开设置时再刷新一次 */
const CATALOG_STALE_MS = 30 * 60 * 1000

export function SettingsDialog() {
  const { settings, open, setOpen, save } = useSettingsStore()
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0.3)
  const [maxContextChars, setMaxContextChars] = useState(24000)
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState(false)
  const [catalog, setCatalog] = useState<ModelCatalogSnapshot | null>(null)
  const [catalogBusy, setCatalogBusy] = useState(false)
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
    setCustomModel(false)
    setApiKey('')
  }, [settings, open])

  useEffect(() => {
    if (!open) return
    let alive = true
    const load = async (): Promise<void> => {
      try {
        let snapshot = await window.remda.catalog.get()
        if (!alive) return
        setCatalog(snapshot)
        const stale = !snapshot.checkedAt || Date.now() - snapshot.checkedAt > CATALOG_STALE_MS
        if (!stale) return
        setCatalogBusy(true)
        snapshot = await window.remda.catalog.refresh()
        if (alive) setCatalog(snapshot)
      } catch {
        // 模型目录不可用不影响设置保存，继续使用内置列表
      } finally {
        if (alive) setCatalogBusy(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [open])

  const selectedProvider = selectedId
    ? (PROVIDERS.find((provider) => provider.id === selectedId) ?? null)
    : null
  const keyUrl = selectedProvider?.keyUrl
  const docUrl = selectedProvider?.docUrl
  const helpUrl = keyUrl ?? docUrl
  const helpLabel = keyUrl ? '获取 API Key' : '查看文档'
  const keyHint = settings?.apiKeyHints[baseUrlKey(baseUrl)] ?? ''

  const modelOptions = useMemo<CatalogModel[]>(() => {
    if (!selectedProvider) return []
    const remote = catalog?.providers[selectedProvider.id]
    const list = remote && remote.length > 0 ? remote : selectedProvider.models
    if (list.some((item) => item.id === selectedProvider.defaultModel)) return list
    return [...list, { id: selectedProvider.defaultModel, name: selectedProvider.defaultModel }]
  }, [catalog, selectedProvider])

  if (!open) return null

  const catalogHint = selectedProvider
    ? (() => {
        const remote = catalog?.providers[selectedProvider.id]
        const updated =
          remote && remote.length > 0 && catalog?.updatedAt
            ? new Date(catalog.updatedAt).toLocaleString()
            : null
        const source = remote && remote.length > 0 ? 'models.dev' : '内置列表'
        const when = updated ? `${source} 更新于 ${updated}` : source
        const failure = catalog?.lastError ? `（更新失败：${catalog.lastError}）` : ''
        const allDeprecated =
          modelOptions.length > 0 && modelOptions.every((model) => model.deprecated)
        const deprecatedNote = allDeprecated
          ? '该供应商的模型均已被 models.dev 标记为弃用。'
          : ''
        return `模型目录：${when}${failure}。${deprecatedNote}列表没有的模型可选「自定义模型…」。`
      })()
    : ''

  const refreshCatalog = async (): Promise<void> => {
    setCatalogBusy(true)
    try {
      setCatalog(await window.remda.catalog.refresh())
    } catch {
      // 失败时保留上一份目录
    } finally {
      setCatalogBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (!model.trim()) {
      setStatus('请选择或填写模型')
      return
    }
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
    if (!model.trim()) {
      setStatus('请选择或填写模型')
      return
    }
    setStatus('测试中…')
    const result = await window.remda.settings.test({
      baseUrl,
      model,
      modelsUrl: selectedProvider?.modelsUrl,
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
            setCustomModel(false)
            setApiKey('')
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

        {selectedProvider ? (
          <>
            <div className="field-label">
              <label htmlFor="settings-model">模型</label>
              <button
                type="button"
                className="btn btn--link"
                disabled={catalogBusy}
                onClick={() => void refreshCatalog()}
              >
                {catalogBusy ? '更新中…' : '刷新列表'}
              </button>
            </div>
            <ModelPicker
              id="settings-model"
              models={modelOptions}
              selectedModel={model}
              custom={customModel}
              onSelect={(optionId) => {
                setStatus(null)
                if (optionId === null) {
                  setCustomModel(true)
                  return
                }
                setCustomModel(false)
                setModel(optionId)
              }}
            />
            {customModel && (
              <>
                <label htmlFor="settings-model-custom">模型 ID</label>
                <input
                  id="settings-model-custom"
                  value={model}
                  placeholder="例如 gpt-5.4-mini"
                  onChange={(e) => setModel(e.target.value)}
                />
              </>
            )}
            <p className="hint">{catalogHint}</p>
          </>
        ) : (
          <>
            <label htmlFor="settings-model">模型</label>
            <input id="settings-model" value={model} onChange={(e) => setModel(e.target.value)} />
            <p className="hint">手动填写模型 ID，必须与服务商提供的一致。</p>
          </>
        )}

        <div className="field-label">
          <label htmlFor="settings-key">API Key</label>
          {helpUrl && (
            <button
              type="button"
              className="btn btn--link"
              onClick={() => void window.remda.shell.openExternal(helpUrl)}
            >
              {helpLabel}
            </button>
          )}
        </div>
        <input
          id="settings-key"
          type="password"
          placeholder={
            keyHint
              ? `已保存：${keyHint}`
              : selectedProvider?.local
                ? '本地服务可留空'
                : '尚未设置'
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="hint">
          {selectedProvider?.local && !keyHint
            ? '本地服务通常不需要 Key；若服务端开启了鉴权再填写。'
            : keyHint
              ? '留空表示保持该服务商现有 Key 不变；Key 按服务商分别加密保存在本机。'
              : '留空表示该服务商暂不设置 Key；Key 按服务商分别加密保存在本机。'}
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
