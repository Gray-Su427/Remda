import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { SelectionToolbar } from './SelectionToolbar'

beforeEach(() => {
  useChatStore.setState({ setQuote: vi.fn() })
  useWorkspaceStore.setState({ activeSectionId: '11-群' })
  document.body.innerHTML = '<div data-testid="reader-scroll"><p id="p1">可被选中的文字</p></div>'
})

describe('SelectionToolbar', () => {
  it('shows a button when text inside the reader is selected', async () => {
    render(<SelectionToolbar />)
    const paragraph = document.getElementById('p1')!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document
      .querySelector('[data-testid="reader-scroll"]')!
      .dispatchEvent(new Event('mouseup', { bubbles: true }))

    const button = await screen.findByRole('button', { name: '问 AI' })
    await userEvent.click(button)
    expect(useChatStore.getState().setQuote).toHaveBeenCalledWith({
      text: '可被选中的文字',
      anchor: '11-群'
    })
  })
})
