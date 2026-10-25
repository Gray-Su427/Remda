import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { PROVIDERS, searchProviders, type ProviderPreset } from '@shared/providers'

export const CUSTOM_PROVIDER_LABEL = '其他（自定义）'

interface ProviderPickerProps {
  id?: string
  /** 选中的预设 id；null 表示「其他（自定义）」 */
  selectedId: string | null
  onSelect(provider: ProviderPreset | null): void
}

export function ProviderPicker({ id, selectedId, onSelect }: ProviderPickerProps) {
  const selected = selectedId
    ? (PROVIDERS.find((provider) => provider.id === selectedId) ?? null)
    : null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const results = useMemo(() => searchProviders(query), [query])
  const optionCount = results.length + 1
  const isCustomActive = activeIndex >= results.length

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const close = (): void => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  const choose = (provider: ProviderPreset | null): void => {
    onSelect(provider)
    close()
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % optionCount)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + optionCount) % optionCount)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(isCustomActive ? null : (results[activeIndex] ?? null))
    }
  }

  return (
    <div className="provider-picker" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="provider-picker__trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="provider-picker-list"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="provider-picker__selected">
          {selected ? selected.name : CUSTOM_PROVIDER_LABEL}
          {selected?.local && <span className="provider-picker__tag">本地</span>}
        </span>
        <span className="provider-picker__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="provider-picker__popover">
          <input
            className="provider-picker__search"
            aria-label="搜索服务商"
            placeholder="搜索服务商，例如 deepseek / 硅基流动"
            value={query}
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onSearchKeyDown}
          />
          {results.length === 0 && <p className="provider-picker__empty">没有匹配的服务商</p>}
          <ul
            className="provider-picker__list"
            id="provider-picker-list"
            role="listbox"
            aria-label="服务商列表"
          >
            {results.map((provider, index) => (
              <li
                key={provider.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`provider-picker__option${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(provider)}
              >
                <span className="provider-picker__option-name">
                  {provider.name}
                  {provider.local && <span className="provider-picker__tag">本地</span>}
                </span>
                <span className="provider-picker__option-url">{provider.baseUrl}</span>
              </li>
            ))}
            <li
              role="option"
              aria-selected={isCustomActive}
              className={`provider-picker__option provider-picker__option--custom${
                isCustomActive ? ' is-active' : ''
              }`}
              onMouseEnter={() => setActiveIndex(results.length)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(null)}
            >
              <span className="provider-picker__option-name">{CUSTOM_PROVIDER_LABEL}</span>
              <span className="provider-picker__option-url">手动填写 Base URL</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
