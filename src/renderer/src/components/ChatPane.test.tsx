import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMockRemda } from '../test/mockRemda'
import { useChatStore } from '../stores/chatStore'
import { ChatPane } from './ChatPane'

const setScrollGeometry = (el: HTMLElement): void => {
  Object.defineProperty(el, 'scrollHeight', { value: 600, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true })
}

const getScroll = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector<HTMLElement>('.chat__scroll')
  if (!el) throw new Error('找不到 .chat__scroll')
  return el
}

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
  it('sends on Enter and clears the textarea', async () => {
    render(<ChatPane />)
    const input = screen.getByPlaceholderText(/问点什么/)
    await userEvent.type(input, '什么是正规子群')
    await userEvent.keyboard('{Enter}')
    expect(useChatStore.getState().send).toHaveBeenCalledWith('什么是正规子群')
    expect(input).toHaveValue('')
  })

  it('inserts a newline on Shift+Enter without sending', async () => {
    render(<ChatPane />)
    const input = screen.getByPlaceholderText(/问点什么/)
    await userEvent.type(input, '第一行')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(useChatStore.getState().send).not.toHaveBeenCalled()
    expect(input).toHaveValue('第一行\n')
  })

  it('does not send while an IME composition is active', async () => {
    render(<ChatPane />)
    const input = screen.getByPlaceholderText(/问点什么/)
    await userEvent.type(input, 'pinyin')
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })

    const composing = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    Object.defineProperty(composing, 'isComposing', { value: true })
    fireEvent(input, composing)

    expect(useChatStore.getState().send).not.toHaveBeenCalled()
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

  it('keeps the newest message in view when a message is appended', async () => {
    useChatStore.setState({
      messages: [{ id: '1', role: 'user', content: '问', createdAt: 1 }]
    })
    const { container } = render(<ChatPane />)
    const scroll = getScroll(container)
    setScrollGeometry(scroll)

    act(() => {
      useChatStore.setState({
        messages: [
          { id: '1', role: 'user', content: '问', createdAt: 1 },
          { id: '2', role: 'assistant', content: '答', createdAt: 2 }
        ]
      })
    })
    expect(scroll.scrollTop).toBe(600)
    expect(await screen.findByText('答')).toBeInTheDocument()
  })

  it('shows a jump-to-bottom button after scrolling up and returns on click', async () => {
    useChatStore.setState({
      messages: [{ id: '1', role: 'user', content: '问', createdAt: 1 }]
    })
    const { container } = render(<ChatPane />)
    const scroll = getScroll(container)
    setScrollGeometry(scroll)

    act(() => {
      scroll.scrollTop = 0
      scroll.dispatchEvent(new Event('scroll'))
    })
    const jump = screen.getByRole('button', { name: '回到底部' })
    await userEvent.click(jump)

    expect(scroll.scrollTop).toBe(600)
    expect(screen.queryByRole('button', { name: '回到底部' })).not.toBeInTheDocument()
  })
})
