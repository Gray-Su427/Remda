import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MenuAction } from '@shared/ipc'
import { demoTree, installMockRemda } from './test/mockRemda'
import { useWorkspaceStore } from './stores/workspaceStore'
import { App } from './App'

beforeEach(() => {
  installMockRemda()
  useWorkspaceStore.setState({
    root: null,
    tree: null,
    currentDoc: null,
    error: null,
    loading: false
  })
  localStorage.clear()
})

describe('App', () => {
  it('renders the three-pane shell', () => {
    render(<App />)
    expect(screen.getByText('Remda')).toBeInTheDocument()
    expect(screen.getByText('还没有打开文件夹')).toBeInTheDocument()
    expect(screen.getByText(/从左侧选择一个 Markdown 文件/)).toBeInTheDocument()
    expect(screen.getByText('AI 阅读助手')).toBeInTheDocument()
  })

  it('reopens the last document from localStorage', async () => {
    const api = installMockRemda()
    localStorage.setItem('remda:lastDocument', 'D:/docs/README.md')
    render(<App />)
    await waitFor(() => expect(api.fs.readDocument).toHaveBeenCalledWith('D:/docs/README.md'))
  })

  it('reopens the last folder and document from localStorage', async () => {
    const api = installMockRemda()
    localStorage.setItem('remda:lastFolder', 'D:/docs')
    localStorage.setItem('remda:lastDocument', 'D:/docs/README.md')
    render(<App />)
    await waitFor(() => expect(api.fs.readTree).toHaveBeenCalledWith('D:/docs'))
    await waitFor(() => expect(api.fs.readDocument).toHaveBeenCalledWith('D:/docs/README.md'))
  })

  it('opens the e2e document from bootstrap instead of the last one', async () => {
    const api = installMockRemda({
      app: {
        getBootstrap: async () => ({ e2eDoc: 'D:/e2e/sample.md' }),
        onMenuAction: () => () => {}
      }
    })
    localStorage.setItem('remda:lastFolder', 'D:/docs')
    localStorage.setItem('remda:lastDocument', 'D:/docs/README.md')
    render(<App />)
    await waitFor(() => expect(api.fs.readDocument).toHaveBeenCalledWith('D:/e2e/sample.md'))
    expect(api.fs.readDocument).not.toHaveBeenCalledWith('D:/docs/README.md')
    expect(api.fs.readTree).not.toHaveBeenCalled()
  })

  it('opens a folder from the application menu', async () => {
    let emit: ((action: MenuAction) => void) | undefined
    const api = installMockRemda({
      app: {
        getBootstrap: async () => ({}),
        onMenuAction: (cb) => {
          emit = cb
          return () => {}
        }
      }
    })
    render(<App />)
    await waitFor(() => expect(emit).toBeTypeOf('function'))

    act(() => emit?.('open-folder'))

    await waitFor(() => expect(api.fs.pickFolder).toHaveBeenCalled())
  })

  it('closes the current folder from the application menu', async () => {
    let emit: ((action: MenuAction) => void) | undefined
    installMockRemda({
      app: {
        getBootstrap: async () => ({}),
        onMenuAction: (cb) => {
          emit = cb
          return () => {}
        }
      }
    })
    useWorkspaceStore.setState({ root: 'D:/docs', tree: demoTree })
    render(<App />)
    await waitFor(() => expect(emit).toBeTypeOf('function'))

    act(() => emit?.('close-folder'))

    expect(useWorkspaceStore.getState().root).toBeNull()
  })

  it('opens settings from the application menu', async () => {
    let emit: ((action: MenuAction) => void) | undefined
    installMockRemda({
      app: {
        getBootstrap: async () => ({}),
        onMenuAction: (cb) => {
          emit = cb
          return () => {}
        }
      }
    })
    render(<App />)
    await waitFor(() => expect(emit).toBeTypeOf('function'))

    act(() => emit?.('settings'))

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeInTheDocument()
  })
})
