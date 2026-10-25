import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { installMockRemda } from './test/mockRemda'
import { useWorkspaceStore } from './stores/workspaceStore'
import { App } from './App'

beforeEach(() => {
  installMockRemda()
  useWorkspaceStore.setState({ root: null, tree: null, currentDoc: null, error: null, loading: false })
})

describe('App', () => {
  it('renders the three-pane shell', () => {
    render(<App />)
    expect(screen.getByText('Remda')).toBeInTheDocument()
    expect(screen.getByText('还没有打开文件夹')).toBeInTheDocument()
    expect(screen.getByText(/从左侧选择一个 Markdown 文件/)).toBeInTheDocument()
    expect(screen.getByText('右侧 AI 区')).toBeInTheDocument()
  })
})
