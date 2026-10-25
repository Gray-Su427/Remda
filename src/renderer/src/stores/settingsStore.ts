import { create } from 'zustand'
import { readErrorMessage } from '@shared/errors'
import type { PublicSettings, SettingsInput, ThemeMode } from '@shared/types'

interface SettingsState {
  settings: PublicSettings | null
  open: boolean
  loading: boolean
  error: string | null
  load(): Promise<void>
  save(patch: Partial<SettingsInput>): Promise<void>
  setOpen(open: boolean): void
  applyTheme(theme: ThemeMode): void
}

export function applyTheme(theme: ThemeMode): void {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
  document.documentElement.dataset.theme = resolved
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  open: false,
  loading: false,
  error: null,

  async load() {
    set({ loading: true })
    try {
      const settings = await window.remda.settings.get()
      set({ settings })
      applyTheme(settings.theme)
    } catch (error) {
      set({ error: readErrorMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  async save(patch) {
    const settings = await window.remda.settings.save(patch)
    set({ settings })
    applyTheme(settings.theme)
  },

  setOpen(open) {
    set({ open })
  },

  applyTheme(theme) {
    applyTheme(theme)
    const current = get().settings
    if (current) set({ settings: { ...current, theme } })
  }
}))
