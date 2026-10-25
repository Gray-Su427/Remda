import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface SearchPickerOption {
  id: string
  label: string
  hint?: string
  tag?: string
  keywords?: string[]
}

interface SearchPickerProps {
  id?: string
  /** 触发按钮的无障碍名称 */
  triggerLabel: string
  searchLabel: string
  placeholder: string
  listLabel: string
  emptyText: string
  options: SearchPickerOption[]
  selectedId: string | null
  custom?: { label: string; hint: string }
  onSelect(id: string | null): void
}

const normalize = (value: string): string => value.trim().toLowerCase()

export function SearchPicker({
  id,
  triggerLabel,
  searchLabel,
  placeholder,
  listLabel,
  emptyText,
  options,
  selectedId,
  custom,
  onSelect
}: SearchPickerProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return options
    return options.filter((option) => {
      const fields = [option.id, option.label, option.hint ?? '', ...(option.keywords ?? [])].map(
        normalize
      )
      return terms.every((term) => fields.some((field) => field.includes(term)))
    })
  }, [options, query])

  const selected = selectedId ? (options.find((option) => option.id === selectedId) ?? null) : null
  const optionCount = results.length + (custom ? 1 : 0)
  const isCustomActive = !!custom && activeIndex >= results.length
  const triggerText = selected?.label ?? selectedId ?? custom?.label ?? ''

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  useEffect(() => {
    if (activeIndex >= optionCount) setActiveIndex(0)
  }, [activeIndex, optionCount])

  const close = (): void => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  const choose = (optionId: string | null): void => {
    onSelect(optionId)
    close()
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      close()
      return
    }
    if (event.key === 'ArrowDown' && optionCount > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % optionCount)
    } else if (event.key === 'ArrowUp' && optionCount > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + optionCount) % optionCount)
    } else if (event.key === 'Enter' && optionCount > 0) {
      event.preventDefault()
      choose(isCustomActive ? null : (results[activeIndex]?.id ?? null))
    }
  }

  return (
    <div className="search-picker" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="search-picker__trigger"
        role="combobox"
        aria-label={triggerLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="search-picker__selected">
          {triggerText}
          {selected?.tag && <span className="search-picker__tag">{selected.tag}</span>}
        </span>
        <span className="search-picker__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="search-picker__popover">
          <input
            className="search-picker__search"
            aria-label={searchLabel}
            placeholder={placeholder}
            value={query}
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onSearchKeyDown}
          />
          {results.length === 0 && <p className="search-picker__empty">{emptyText}</p>}
          <ul
            className="search-picker__list"
            id={listId}
            role="listbox"
            aria-label={listLabel}
          >
            {results.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`search-picker__option${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.id)}
              >
                <span className="search-picker__option-name">
                  {option.label}
                  {option.tag && <span className="search-picker__tag">{option.tag}</span>}
                </span>
                {option.hint && (
                  <span className="search-picker__option-hint">{option.hint}</span>
                )}
              </li>
            ))}
            {custom && (
              <li
                role="option"
                aria-selected={isCustomActive}
                className={`search-picker__option search-picker__option--custom${
                  isCustomActive ? ' is-active' : ''
                }`}
                onMouseEnter={() => setActiveIndex(results.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(null)}
              >
                <span className="search-picker__option-name">{custom.label}</span>
                <span className="search-picker__option-hint">{custom.hint}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
