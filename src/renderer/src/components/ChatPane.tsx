import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '../markdown/render'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import '../styles/chat.css'

function Markdown({ content }: { content: string }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let cancelled = false
    void renderMarkdown(content).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [content])
  return <div className="markdown chat__markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

export function ChatPane() {
  const {
    messages,
    streaming,
    quote,
    error,
    send,
    stop,
    retry,
    clear,
    setQuote,
    loadFor
  } = useChatStore()
  const docPath = useWorkspaceStore((s) => s.currentDoc?.path)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (docPath) void loadFor(docPath)
  }, [docPath, loadFor])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  const submit = async (): Promise<void> => {
    if (streaming || !draft.trim()) return
    const question = draft
    setDraft('')
    await send(question)
  }

  return (
    <div className="chat">
      <div className="chat__header">
        <span>AI 阅读助手</span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void clear()}
          disabled={messages.length === 0}
        >
          清空
        </button>
      </div>

      <div className="chat__scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat__hint">
            打开一篇文档，然后在这里提问。选中左侧文字可以直接追问。
            <br />
            快捷键：Ctrl+Enter 发送。
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`bubble bubble--${message.role}`}>
            {message.quote && <blockquote className="bubble__quote">{message.quote.text}</blockquote>}
            {message.role === 'assistant' ? (
              <Markdown content={message.content} />
            ) : (
              <p>{message.content}</p>
            )}
            {message.error && (
              <div className="bubble__error" role="alert">
                {message.error}
              </div>
            )}
          </div>
        ))}
        {streaming && <p className="chat__typing">正在回答…</p>}
      </div>

      {error && (
        <div className="chat__error" role="alert">
          {error}
        </div>
      )}
      {messages.some((m) => m.error) && (
        <button type="button" className="btn chat__retry" onClick={() => void retry()}>
          重试
        </button>
      )}

      {quote && (
        <div className="quote-chip">
          <span className="quote-chip__text">{quote.text}</span>
          <button type="button" aria-label="移除引用" onClick={() => setQuote(null)}>
            ×
          </button>
        </div>
      )}

      <div className="chat__composer">
        <textarea
          ref={textareaRef}
          value={draft}
          placeholder="问点什么…（Ctrl+Enter 发送）"
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        {streaming ? (
          <button type="button" className="btn" onClick={() => void stop()}>
            停止
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={!draft.trim()}
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
