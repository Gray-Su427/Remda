/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { exitFullscreenOnEscape, type FullscreenInput, type FullscreenTarget } from './fullscreen'

type Listener = (event: { preventDefault(): void }, input: FullscreenInput) => void

function setup(fullscreen: boolean) {
  let listener: Listener | undefined
  const target: FullscreenTarget = {
    isFullScreen: () => fullscreen,
    setFullScreen: vi.fn(),
    webContents: {
      on: (_event, cb) => {
        listener = cb
      }
    }
  }
  exitFullscreenOnEscape(target)
  return {
    target,
    emit(input: FullscreenInput) {
      const preventDefault = vi.fn()
      listener?.({ preventDefault }, input)
      return preventDefault
    }
  }
}

describe('exitFullscreenOnEscape', () => {
  it('leaves fullscreen and prevents the renderer from also handling Escape', () => {
    const { target, emit } = setup(true)
    const preventDefault = emit({ type: 'keyDown', key: 'Escape', code: 'Escape' })
    expect(target.setFullScreen).toHaveBeenCalledWith(false)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape untouched when the window is not fullscreen', () => {
    const { target, emit } = setup(false)
    const preventDefault = emit({ type: 'keyDown', key: 'Escape', code: 'Escape' })
    expect(target.setFullScreen).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('ignores key up and other keys', () => {
    const { target, emit } = setup(true)
    emit({ type: 'keyUp', key: 'Escape', code: 'Escape' })
    emit({ type: 'keyDown', key: 'Enter', code: 'Enter' })
    expect(target.setFullScreen).not.toHaveBeenCalled()
  })
})
