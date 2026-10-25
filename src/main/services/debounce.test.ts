/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebouncer } from './debounce'

afterEach(() => vi.useRealTimers())

describe('createDebouncer', () => {
  it('runs only the last call within the window', () => {
    vi.useFakeTimers()
    const debounce = createDebouncer(150)
    const calls: number[] = []
    debounce(() => calls.push(1))
    debounce(() => calls.push(2))
    debounce(() => calls.push(3))
    vi.advanceTimersByTime(149)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual([3])
  })
})
