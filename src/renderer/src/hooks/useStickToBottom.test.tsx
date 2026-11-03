import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStickToBottom } from './useStickToBottom'

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}

const setGeometry = (el: HTMLElement, scrollHeight: number, clientHeight: number): void => {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
}

function Harness({
  pinKey,
  scrollHeight,
  clientHeight
}: {
  pinKey: string
  scrollHeight: number
  clientHeight: number
}) {
  const { scrollRef, contentRef, atBottom, scrollToBottom } = useStickToBottom(pinKey)
  return (
    <div>
      <div
        data-testid="scroll"
        ref={(el) => {
          scrollRef.current = el
          if (el) setGeometry(el, scrollHeight, clientHeight)
        }}
      >
        <div data-testid="content" ref={contentRef}>
          内容
        </div>
      </div>
      <span data-testid="at-bottom">{atBottom ? 'yes' : 'no'}</span>
      <button type="button" onClick={scrollToBottom}>
        回到底部
      </button>
    </div>
  )
}

const triggerResize = (): void => {
  const observer = ResizeObserverMock.instances.at(-1)
  if (!observer) throw new Error('ResizeObserver 尚未创建')
  act(() => observer.trigger())
}

const scrollTo = (el: HTMLElement, top: number): void => {
  act(() => {
    el.scrollTop = top
    el.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  ResizeObserverMock.instances = []
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStickToBottom', () => {
  it('pins to the bottom on mount', () => {
    const { getByTestId } = render(
      <Harness pinKey="doc:0:" scrollHeight={600} clientHeight={200} />
    )
    expect(getByTestId('scroll').scrollTop).toBe(600)
    expect(getByTestId('at-bottom')).toHaveTextContent('yes')
  })

  it('follows content growth while pinned', () => {
    const { getByTestId } = render(
      <Harness pinKey="doc:0:" scrollHeight={600} clientHeight={200} />
    )
    const scroll = getByTestId('scroll')
    setGeometry(scroll, 900, 200)
    triggerResize()
    expect(scroll.scrollTop).toBe(900)
  })

  it('stops following after the user scrolls up', () => {
    const { getByTestId } = render(
      <Harness pinKey="doc:0:" scrollHeight={600} clientHeight={200} />
    )
    const scroll = getByTestId('scroll')
    scrollTo(scroll, 100)
    expect(getByTestId('at-bottom')).toHaveTextContent('no')

    setGeometry(scroll, 900, 200)
    triggerResize()
    expect(scroll.scrollTop).toBe(100)
  })

  it('resumes following when the user scrolls back to the bottom', () => {
    const { getByTestId } = render(
      <Harness pinKey="doc:0:" scrollHeight={600} clientHeight={200} />
    )
    const scroll = getByTestId('scroll')
    scrollTo(scroll, 100)
    scrollTo(scroll, 400)
    expect(getByTestId('at-bottom')).toHaveTextContent('yes')

    setGeometry(scroll, 900, 200)
    triggerResize()
    expect(scroll.scrollTop).toBe(900)
  })

  it('forces a pin when a new message arrives', () => {
    const { getByTestId, rerender } = render(
      <Harness pinKey="doc:1:a" scrollHeight={600} clientHeight={200} />
    )
    const scroll = getByTestId('scroll')
    scrollTo(scroll, 0)
    expect(getByTestId('at-bottom')).toHaveTextContent('no')

    rerender(<Harness pinKey="doc:2:b" scrollHeight={600} clientHeight={200} />)
    expect(scroll.scrollTop).toBe(600)
    expect(getByTestId('at-bottom')).toHaveTextContent('yes')
  })

  it('returns to the bottom when the jump helper is used', async () => {
    const { getByTestId } = render(
      <Harness pinKey="doc:0:" scrollHeight={600} clientHeight={200} />
    )
    const scroll = getByTestId('scroll')
    scrollTo(scroll, 0)

    await userEvent.click(screen.getByRole('button', { name: '回到底部' }))
    expect(scroll.scrollTop).toBe(600)
    expect(getByTestId('at-bottom')).toHaveTextContent('yes')
  })
})
