import { create } from 'zustand'
import type { DocumentPayload, FileNode } from '@shared/types'

interface WorkspaceState {
  root: string | null
  tree: FileNode | null
  currentDoc: DocumentPayload | null
  activeSectionId: string | null
  loading: boolean
  error: string | null
  openFolder(): Promise<void>
  openFile(path: string): Promise<void>
  openFileDialog(): Promise<void>
  setActiveSection(id: string | null): void
  closeFolder(): void
  setError(message: string | null): void
}

const messageOf = (error: unknown): string => {
  const shaped = error as { message?: string }
  return shaped?.message ?? String(error)
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  root: null,
  tree: null,
  currentDoc: null,
  activeSectionId: null,
  loading: false,
  error: null,

  async openFolder() {
    set({ loading: true, error: null })
    try {
      const root = await window.remda.fs.pickFolder()
      if (!root) return
      const tree = await window.remda.fs.readTree(root)
      set({ root, tree })
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ loading: false })
    }
  },

  async openFile(path: string) {
    const previous = get().currentDoc?.path
    set({ loading: true, error: null })
    try {
      const doc = await window.remda.fs.readDocument(path)
      if (previous && previous !== path) await window.remda.fs.unwatch(previous)
      set({ currentDoc: doc, activeSectionId: null })
      await window.remda.fs.watch(path)
      localStorage.setItem('remda:lastDocument', path)
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ loading: false })
    }
  },

  async openFileDialog() {
    const path = await window.remda.fs.pickFile()
    if (path) await get().openFile(path)
  },

  setActiveSection(id: string | null) {
    if (get().activeSectionId !== id) set({ activeSectionId: id })
  },

  closeFolder() {
    set({ root: null, tree: null })
  },

  setError(message: string | null) {
    set({ error: message })
  }
}))
