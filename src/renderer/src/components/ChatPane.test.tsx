import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMockRemda } from '../test/mockRemda'
import { useChatStore } from '../stores/chatStore'
import { ChatPane } from './ChatPane'

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    streaming: false,
    activeRequestId: null,
    quote: null,
    error: null,
    send: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    setQuote: vi.fn()
  })
  installMockRemda()
})

describe('ChatPane', () => {
  it('sends on Ctrl+Enter and clears the textarea', async () => {
    render(<ChatPane />)
    const input = screen.getByPlaceholderText(/问点什么/)
    await userEvent.type(input, '什么是正规子群')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(useChatStore.getState().send).toHaveBeenCalledWith('什么是正规子群')
    expect(input).toHaveValue('')
  })

  it('disables send while streaming and shows stop', () => {
    useChatStore.setState({ streaming: true })
    render(<ChatPane />)
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
  })

  it('renders messages and an error banner with retry', async () => {
    useChatStore.setState({
      messages: [
        { id: '1', role: 'user', content: '问', createdAt: 1 },
        { id: '2', role: 'assistant', content: '答', createdAt: 2, error: '限流' }
      ]
    })
    render(<ChatPane />)
    expect(screen.getByText('问')).toBeInTheDocument()
    expect(await screen.findByText('答')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('限流')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('shows the quote chip and lets the user dismiss it', async () => {
    useChatStore.setState({ quote: { text: '被选中的一句话', anchor: '11-群' } })
    render(<ChatPane />)
    expect(screen.getByText('被选中的一句话')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '移除引用' }))
    expect(useChatStore.getState().setQuote).toHaveBeenCalledWith(null)
  })
})
