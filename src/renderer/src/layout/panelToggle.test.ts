import { describe, expect, it, vi } from 'vitest'
import { togglePanel, type CollapsiblePanel } from './panelToggle'

function makePanel(collapsed: boolean): CollapsiblePanel {
  return {
    isCollapsed: () => collapsed,
    collapse: vi.fn(),
    expand: vi.fn()
  }
}

describe('togglePanel', () => {
  it('expands a collapsed panel', () => {
    const panel = makePanel(true)
    togglePanel(panel)
    expect(panel.expand).toHaveBeenCalledTimes(1)
    expect(panel.collapse).not.toHaveBeenCalled()
  })

  it('collapses an expanded panel', () => {
    const panel = makePanel(false)
    togglePanel(panel)
    expect(panel.collapse).toHaveBeenCalledTimes(1)
    expect(panel.expand).not.toHaveBeenCalled()
  })

  it('does nothing before the panel mounts', () => {
    expect(() => togglePanel(null)).not.toThrow()
  })
})
