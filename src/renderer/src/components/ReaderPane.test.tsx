import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installMockRemda } from '../test/mockRemda'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { ReaderPane } from './ReaderPane'

beforeEach(() => {
  useWorkspaceStore.setState({
    root: 'D:/docs',
    tree: null,
    currentDoc: null,
    loading: false,
    error: null
  })
})

describe('ReaderPane', () => {
  it('shows an empty state before a document is opened', () => {
    installMockRemda()
    render(<ReaderPane />)
    expect(screen.getByText(/从左侧选择一个 Markdown 文件/)).toBeInTheDocument()
  })

  it('renders markdown with heading anchors and katex', async () => {
    installMockRemda()
    useWorkspaceStore.setState({
      currentDoc: {
        path: 'D:/docs/a.md',
        name: 'a.md',
        content: '# 1.1 群\n\n正规子群 $N \\trianglelefteq G$\n',
        mtimeMs: 1,
        size: 30
      }
    })
    render(<ReaderPane />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('id', '11-群')
    expect(document.querySelector('.katex')).not.toBeNull()
  })

  it('opens http links externally and ignores in-page anchors', async () => {
    const api = installMockRemda()
    useWorkspaceStore.setState({
      currentDoc: {
        path: 'D:/docs/a.md',
        name: 'a.md',
        content: '[外链](https://example.com) 与 [锚点](#sec)',
        mtimeMs: 1,
        size: 10
      }
    })
    render(<ReaderPane />)
    await userEvent.click(await screen.findByText('外链'))
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://example.com')
    await userEvent.click(screen.getByText('锚点'))
    expect(api.shell.openExternal).toHaveBeenCalledTimes(1)
  })

  it('shows the store error banner', async () => {
    installMockRemda()
    useWorkspaceStore.setState({ error: '文件不存在：D:/x.md' })
    render(<ReaderPane />)
    expect(screen.getByRole('alert')).toHaveTextContent('文件不存在：D:/x.md')
  })
})
