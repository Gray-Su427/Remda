import { useEffect, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

interface ToolbarState {
  text: string
  x: number
  y: number
}

function selectionRect(range: Range): { left: number; top: number; width: number } {
  const getter = (range as Range & { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect
  if (typeof getter !== 'function') return { left: 0, top: 0, width: 0 }
  const rect = getter.call(range)
  return { left: rect.left, top: rect.top, width: rect.width }
}

export function SelectionToolbar() {
  const [state, setState] = useState<ToolbarState | null>(null)
  const setQuote = useChatStore((s) => s.setQuote)

  useEffect(() => {
    const onMouseUp = (event: MouseEvent): void => {
      const container = (event.target as HTMLElement).closest('[data-testid="reader-scroll"]')
      if (!container) return
      const selection = window.getSelection()
      const text = selection?.toString().trim() ?? ''
      if (!selection || selection.rangeCount === 0 || text.length < 2) {
        setState(null)
        return
      }
      const range = selection.getRangeAt(0)
      const rect = selectionRect(range)
      setState({ text, x: rect.left + rect.width / 2, y: rect.top - 8 })
    }
    const onMouseDown = (event: MouseEvent): void => {
      if (!(event.target as HTMLElement).closest('.selection-toolbar')) setState(null)
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  if (!state) return null

  return (
    <button
      type="button"
      className="selection-toolbar"
      style={{ left: state.x, top: state.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        setQuote({
          text: state.text,
          anchor: useWorkspaceStore.getState().activeSectionId ?? undefined
        })
        setState(null)
        window.getSelection()?.removeAllRanges()
      }}
    >
      问 AI
    </button>
  )
}
