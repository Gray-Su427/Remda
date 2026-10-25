import { create } from 'zustand'
import type { ChatEvent } from '@shared/ipc'
import { buildChatContext, buildRequestMessages } from '@shared/chat/context'
import type { ChatMessage } from '@shared/types'
import { useSettingsStore } from './settingsStore'
import { useWorkspaceStore } from './workspaceStore'

interface Quote {
  text: string
  anchor?: string
}

interface ChatState {
  messages: ChatMessage[]
  streaming: boolean
  activeRequestId: string | null
  quote: Quote | null
  error: string | null
  loadedFor: string | null
  send(question: string): Promise<void>
  stop(): Promise<void>
  retry(): Promise<void>
  clear(): Promise<void>
  setQuote(quote: Quote | null): void
  loadFor(docPath: string): Promise<void>
}

const messageOf = (error: unknown): string => (error as { message?: string })?.message ?? String(error)

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

let unsubscribe: (() => void) | null = null

export const useChatStore = create<ChatState>((set, get) => {
  const patchLast = (patch: Partial<ChatMessage>): void => {
    set((state) => {
      const messages = [...state.messages]
      const index = messages.length - 1
      const last = messages[index]
      if (!last || last.role !== 'assistant') return state
      messages[index] = { ...last, ...patch }
      return { messages }
    })
  }

  const persist = async (state: ChatState): Promise<void> => {
    const doc = useWorkspaceStore.getState().currentDoc
    if (!doc) return
    await window.remda.conversations.save(doc.path, state.messages)
  }

  const subscribe = (): void => {
    unsubscribe?.()
    unsubscribe = window.remda.chat.onEvent((event: ChatEvent) => {
      const requestId = get().activeRequestId
      if (event.requestId !== requestId) return
      if (event.type === 'delta') {
        set((state) => {
          const messages = [...state.messages]
          const last = messages.at(-1)
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: last.content + event.text }
          }
          return { messages }
        })
        return
      }
      if (event.type === 'error') {
        patchLast({ error: event.message })
        set({ streaming: false, activeRequestId: null })
        void persist(get())
        return
      }
      set({ streaming: false, activeRequestId: null })
      void persist(get())
    })
  }

  return {
    messages: [],
    streaming: false,
    activeRequestId: null,
    quote: null,
    error: null,
    loadedFor: null,

    async loadFor(docPath: string) {
      if (get().loadedFor === docPath) return
      const messages = await window.remda.conversations.load(docPath)
      set({ messages, loadedFor: docPath, error: null, quote: null })
    },

    async send(question: string) {
      const trimmed = question.trim()
      if (!trimmed || get().streaming) return
      const doc = useWorkspaceStore.getState().currentDoc
      if (!doc) {
        set({ error: '请先打开一个 Markdown 文档' })
        return
      }
      const settings = useSettingsStore.getState().settings
      if (settings && !settings.hasApiKey) {
        set({ error: '还没有配置 API Key，请到设置里填写' })
        return
      }

      const quote = get().quote ?? undefined
      const userMessage: ChatMessage = {
        id: newId(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
        quote: quote ? { text: quote.text, anchor: quote.anchor } : undefined
      }
      const assistantMessage: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now()
      }
      const history = get().messages
      set({
        messages: [...history, userMessage, assistantMessage],
        streaming: true,
        error: null,
        quote: null
      })

      const requestId = newId()
      set({ activeRequestId: requestId })
      subscribe()

      const built = buildChatContext({
        docPath: doc.path,
        markdown: doc.content,
        selection: quote?.text,
        activeSectionId: quote?.anchor ?? useWorkspaceStore.getState().activeSectionId ?? undefined,
        budget: settings?.maxContextChars ?? 24000
      })
      const messages = buildRequestMessages(history, trimmed, built)
      try {
        await window.remda.chat.start({ requestId, messages })
      } catch (error) {
        patchLast({ error: messageOf(error) })
        set({ streaming: false, activeRequestId: null })
      }
    },

    async stop() {
      const requestId = get().activeRequestId
      if (!requestId) return
      await window.remda.chat.abort(requestId)
      set({ streaming: false, activeRequestId: null })
      void persist(get())
    },

    async retry() {
      const messages = get().messages
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      if (!lastUser) return
      set({ messages: messages.filter((m) => m.id !== lastUser.id && !m.error) })
      await get().send(lastUser.content)
    },

    async clear() {
      const doc = useWorkspaceStore.getState().currentDoc
      set({ messages: [], quote: null, error: null })
      if (doc) await window.remda.conversations.clear(doc.path)
    },

    setQuote(quote: Quote | null) {
      set({ quote })
    }
  }
})
