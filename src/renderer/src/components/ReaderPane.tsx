import { useEffect, useRef, useState, type UIEvent } from 'react'
import { findActiveHeading } from '@shared/reading/activeHeading'
import { renderMarkdown } from '../markdown/render'
import { useWorkspaceStore } from '../stores/workspaceStore'
import '../styles/markdown.css'

export function ReaderPane() {
  const doc = useWorkspaceStore((s) => s.currentDoc)
  const error = useWorkspaceStore((s) => s.error)
  const openFileDialog = useWorkspaceStore((s) => s.openFileDialog)
  const setActiveSection = useWorkspaceStore((s) => s.setActiveSection)
  const [html, setHtml] = useState('')
  const [rendering, setRendering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const container = event.currentTarget
    const headings = Array.from(
      container.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')
    ).map((element) => ({ id: element.id, top: (element as HTMLElement).offsetTop }))
    setActiveSection(findActiveHeading(headings, container.scrollTop, 80))
  }

  useEffect(() => {
    let cancelled = false
    if (!doc) {
      setHtml('')
      return
    }
    setRendering(true)
    void renderMarkdown(doc.content)
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .finally(() => {
        if (!cancelled) setRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc?.path, doc?.mtimeMs, doc?.content])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onClick = (event: MouseEvent): void => {
      const anchor = (event.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (href.startsWith('#')) {
        event.preventDefault()
        const target = el.querySelector(href)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (/^https?:\/\//i.test(href)) {
        event.preventDefault()
        void window.remda.shell.openExternal(href)
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [html])

  if (!doc) {
    return (
      <div className="reader reader--empty">
        {error && (
          <div className="reader__error" role="alert">
            {error}
          </div>
        )}
        <p>从左侧选择一个 Markdown 文件，或打开一个文件夹。</p>
        <button type="button" className="btn" onClick={() => void openFileDialog()}>
          打开文件
        </button>
      </div>
    )
  }

  return (
    <div className="reader">
      {error && (
        <div className="reader__error" role="alert">
          {error}
        </div>
      )}
      <div
        className="reader__scroll"
        data-testid="reader-scroll"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {rendering && !html ? (
          <p className="reader__loading">渲染中…</p>
        ) : (
          <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
