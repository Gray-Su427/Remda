/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { findActiveHeading } from './activeHeading'

const headings = [
  { id: 'a', top: 0 },
  { id: 'b', top: 400 },
  { id: 'c', top: 900 }
]

describe('findActiveHeading', () => {
  it('returns the last heading above the reading line', () => {
    expect(findActiveHeading(headings, 0)).toBe('a')
    expect(findActiveHeading(headings, 399)).toBe('a')
    expect(findActiveHeading(headings, 400)).toBe('b')
    expect(findActiveHeading(headings, 1000)).toBe('c')
  })

  it('applies the offset (reading line below the top edge)', () => {
    expect(findActiveHeading(headings, 319, 80)).toBe('a')
    expect(findActiveHeading(headings, 320, 80)).toBe('b')
  })

  it('returns null when there are no headings or scrolling above the first', () => {
    expect(findActiveHeading([], 100)).toBeNull()
    expect(findActiveHeading(headings, -50)).toBeNull()
  })
})
