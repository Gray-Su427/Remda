import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { installMockRemda, demoTree } from '../test/mockRemda'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { FileTree } from './FileTree'

beforeEach(() => {
  useWorkspaceStore.setState({
    root: 'D:/docs',
    tree: demoTree,
    currentDoc: null,
    loading: false,
    error: null
  })
  installMockRemda()
})

describe('FileTree', () => {
  it('renders nested folders collapsed by default, then expands', async () => {
    render(<FileTree />)
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('1.1.md')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ch01/ }))
    expect(screen.getByText('1.1.md')).toBeInTheDocument()
  })

  it('opens a file when clicked', async () => {
    const api = installMockRemda()
    render(<FileTree />)
    await userEvent.click(screen.getByText('README.md'))
    expect(api.fs.readDocument).toHaveBeenCalledWith('D:/docs/README.md')
  })
})
