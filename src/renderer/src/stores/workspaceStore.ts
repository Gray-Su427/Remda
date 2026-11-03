import { create } from 'zustand'
import { readErrorMessage } from '@shared/errors'
import type { DocumentPayload, FileNode } from '@shared/types'
import { dirname } from '../markdown/images'

const LAST_FOLDER_KEY = 'remda:lastFolder'
const LAST_DOCUMENT_KEY = 'remda:lastDocument'

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
  restoreLastWorkspace(): Promise<void>
  setActiveSection(id: string | null): void
  closeFolder(): void
  setError(message: string | null): void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const applyFolder = async (root: string): Promise<void> => {
    const tree = await window.remda.fs.readTree(root)
    set({ root, tree })
    localStorage.setItem(LAST_FOLDER_KEY, root)
  }

  return {
    root: null,
    tree: null,
    currentDoc: null,
    activeSectionId: null,
    loading: false,
    error: null,

    async openFolder() {
      set({ loading: true, error: null })
      try {
        const root = await window.remda.fs.pickFolder(get().root ?? undefined)
        if (root) await applyFolder(root)
      } catch (error) {
        set({ error: readErrorMessage(error) })
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
        localStorage.setItem(LAST_DOCUMENT_KEY, path)
      } catch (error) {
        set({ error: readErrorMessage(error) })
      } finally {
        set({ loading: false })
      }
    },

    async openFileDialog() {
      const current = get().currentDoc?.path
      const last = localStorage.getItem(LAST_DOCUMENT_KEY)
      const base = current ?? last
      const defaultPath = get().root ?? (base ? dirname(base) : undefined)
      try {
        const path = await window.remda.fs.pickFile(defaultPath)
        if (path) await get().openFile(path)
      } catch (error) {
        set({ error: readErrorMessage(error) })
      }
    },

    async restoreLastWorkspace() {
      const lastFolder = localStorage.getItem(LAST_FOLDER_KEY)
      if (lastFolder) {
        set({ loading: true })
        try {
          await applyFolder(lastFolder)
        } catch {
          // 上次的文件夹可能已被移动或删除，启动时静默忽略。
          localStorage.removeItem(LAST_FOLDER_KEY)
        } finally {
          set({ loading: false })
        }
      }

      const lastDocument = localStorage.getItem(LAST_DOCUMENT_KEY)
      if (!lastDocument) return
      await get().openFile(lastDocument)
      if (!get().currentDoc) localStorage.removeItem(LAST_DOCUMENT_KEY)
    },

    setActiveSection(id: string | null) {
      if (get().activeSectionId !== id) set({ activeSectionId: id })
    },

    closeFolder() {
      localStorage.removeItem(LAST_FOLDER_KEY)
      set({ root: null, tree: null })
    },

    setError(message: string | null) {
      set({ error: message })
    }
  }
})
