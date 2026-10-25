import { beforeEach, describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { installMockRemda } from '../test/mockRemda'
import { useWorkspaceStore } from './workspaceStore'

beforeEach(() => {
  useWorkspaceStore.setState({ root: null, tree: null, currentDoc: null, loading: false, error: null })
})

describe('workspaceStore', () => {
  it('opens a folder and loads its tree', async () => {
    installMockRemda()
    await act(async () => {
      await useWorkspaceStore.getState().openFolder()
    })
    const state = useWorkspaceStore.getState()
    expect(state.root).toBe('D:/docs')
    const tree = state.tree
    if (tree?.kind !== 'dir') throw new Error('expected a directory tree')
    expect(tree.children).toHaveLength(2)
  })

  it('opens a document and starts watching it', async () => {
    const api = installMockRemda()
    await act(async () => {
      await useWorkspaceStore.getState().openFile('D:/docs/README.md')
    })
    expect(useWorkspaceStore.getState().currentDoc?.content).toContain('# README')
    expect(api.fs.watch).toHaveBeenCalledWith('D:/docs/README.md')
  })

  it('surfaces load errors without clearing the current document', async () => {
    installMockRemda({
      fs: {
        ...installMockRemda().fs,
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
})
