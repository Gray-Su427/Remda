import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  matchProviderByBaseUrl,
  searchProviders,
  type ProviderPreset
} from '@shared/providers'

interface ProviderPickerProps {
  id?: string
  /** 当前生效的 Base URL，用于反推选中的服务商 */
  value: string
  onSelect(provider: ProviderPreset): void
}

export function ProviderPicker({ id, value, onSelect }: ProviderPickerProps) {
  const selected = matchProviderByBaseUrl(value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const results = useMemo(() => searchProviders(query), [query])

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

  const choose = (provider: ProviderPreset): void => {
    onSelect(provider)
    close()
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const provider = results[activeIndex]
      if (provider) choose(provider)
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
          {selected ? selected.name : '自定义'}
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
          {results.length > 0 ? (
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
            </ul>
          ) : (
            <p className="provider-picker__empty">没有匹配的服务商</p>
          )}
        </div>
      )}
    </div>
  )
}
