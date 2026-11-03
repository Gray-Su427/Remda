import { beforeEach, describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { demoTree, installMockRemda, mockRemda } from '../test/mockRemda'
import { useWorkspaceStore } from './workspaceStore'

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.setState({
    root: null,
    tree: null,
    currentDoc: null,
    activeSectionId: null,
    loading: false,
    error: null
  })
})

describe('workspaceStore', () => {
  it('opens a folder, loads its tree and remembers it', async () => {
    const api = installMockRemda()
    await act(async () => {
      await useWorkspaceStore.getState().openFolder()
    })
    const state = useWorkspaceStore.getState()
    expect(state.root).toBe('D:/docs')
    expect(api.fs.pickFolder).toHaveBeenCalledWith(undefined)
    expect(localStorage.getItem('remda:lastFolder')).toBe('D:/docs')
    const tree = state.tree
    if (tree?.kind !== 'dir') throw new Error('expected a directory tree')
    expect(tree.children).toHaveLength(2)
  })

  it('starts the folder dialog from the current root', async () => {
    const api = installMockRemda()
    useWorkspaceStore.setState({ root: 'D:/older', tree: demoTree })
    await act(async () => {
      await useWorkspaceStore.getState().openFolder()
    })
    expect(api.fs.pickFolder).toHaveBeenCalledWith('D:/older')
  })

  it('opens a document, starts watching it and remembers it', async () => {
    const api = installMockRemda()
    await act(async () => {
      await useWorkspaceStore.getState().openFile('D:/docs/README.md')
    })
    expect(useWorkspaceStore.getState().currentDoc?.content).toContain('# README')
    expect(api.fs.watch).toHaveBeenCalledWith('D:/docs/README.md')
    expect(localStorage.getItem('remda:lastDocument')).toBe('D:/docs/README.md')
  })

  it('surfaces load errors without clearing the current document', async () => {
    installMockRemda({
      fs: {
        ...mockRemda().fs,
        readDocument: async () => {
          throw { code: 'FS_NOT_FOUND', message: '文件不存在：D:/x.md' }
        }
      }
    })
    await act(async () => {
      await useWorkspaceStore.getState().openFile('D:/x.md')
    })
    expect(useWorkspaceStore.getState().error).toBe('文件不存在：D:/x.md')
  })

  it('restores the last folder and document on startup', async () => {
    const api = installMockRemda()
    localStorage.setItem('remda:lastFolder', 'D:/docs')
    localStorage.setItem('remda:lastDocument', 'D:/docs/README.md')

    await act(async () => {
      await useWorkspaceStore.getState().restoreLastWorkspace()
    })

    expect(api.fs.readTree).toHaveBeenCalledWith('D:/docs')
    expect(api.fs.readDocument).toHaveBeenCalledWith('D:/docs/README.md')
    const state = useWorkspaceStore.getState()
    expect(state.root).toBe('D:/docs')
    expect(state.currentDoc?.path).toBe('D:/docs/README.md')
  })

  it('silently drops a missing last folder', async () => {
    installMockRemda({
      fs: {
        ...mockRemda().fs,
        readTree: async () => {
          throw { code: 'FS_NOT_FOUND', message: '路径不存在：D:/gone' }
        }
      }
    })
    localStorage.setItem('remda:lastFolder', 'D:/gone')

    await act(async () => {
      await useWorkspaceStore.getState().restoreLastWorkspace()
    })

    expect(localStorage.getItem('remda:lastFolder')).toBeNull()
    expect(useWorkspaceStore.getState().error).toBeNull()
  })

  it('starts the file dialog from the current folder', async () => {
    const api = installMockRemda()
    useWorkspaceStore.setState({ root: 'D:/docs' })

    await act(async () => {
      await useWorkspaceStore.getState().openFileDialog()
    })

    expect(api.fs.pickFile).toHaveBeenCalledWith('D:/docs')
  })

  it('starts the file dialog from the current document directory without a folder', async () => {
    const api = installMockRemda()
    useWorkspaceStore.setState({
      currentDoc: {
        path: 'D:/docs/ch01/1.1.md',
        name: '1.1.md',
        content: '# 1.1',
        mtimeMs: 1,
        size: 10
      }
    })

    await act(async () => {
      await useWorkspaceStore.getState().openFileDialog()
    })

    expect(api.fs.pickFile).toHaveBeenCalledWith('D:/docs/ch01')
  })

  it('clears the remembered folder when closing it', () => {
    localStorage.setItem('remda:lastFolder', 'D:/docs')
    useWorkspaceStore.setState({ root: 'D:/docs', tree: demoTree })

    useWorkspaceStore.getState().closeFolder()

    expect(localStorage.getItem('remda:lastFolder')).toBeNull()
    expect(useWorkspaceStore.getState().root).toBeNull()
    expect(useWorkspaceStore.getState().tree).toBeNull()
  })
})
