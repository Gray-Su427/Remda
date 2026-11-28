/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { IPC, type ChatEvent } from '@shared/ipc'
import { baseUrlKey } from '@shared/providers'
import type { SettingsInput } from '@shared/types'
import { DEFAULT_SETTINGS, SettingsStore } from '../services/settingsStore'
import { ConversationStore } from '../services/conversationStore'
import { createHandlers, registerIpc, type HandlerDeps } from './register'

const makeSettings = (apiKey = '', overrides: Partial<SettingsInput> = {}): SettingsStore => {
  const store = new SettingsStore('C:/tmp/does-not-exist-settings.json', null)
  const settings = { ...DEFAULT_SETTINGS, ...overrides, apiKey }
  store.load = async () => settings
  store.getPublic = async () =>
    store.toPublic(settings, apiKey ? { [baseUrlKey(settings.baseUrl)]: `plain:${apiKey}` } : {})
  if (apiKey) store.resolveApiKey = async () => apiKey
  return store
}

const makeDeps = (
  events: ChatEvent[],
  apiKey = '',
  settingsOverrides: Partial<SettingsInput> = {}
): HandlerDeps => ({
  pickFolder: async () => 'D:/docs',
  pickFile: async () => 'D:/docs/a.md',
  settings: makeSettings(apiKey, settingsOverrides),
  conversations: new ConversationStore('C:/tmp/remda-test-conv'),
  catalog: {
    get: async () => ({ updatedAt: null, checkedAt: null, providers: {} }),
    refresh: async () => ({ updatedAt: null, checkedAt: null, providers: {} })
  },
  workspace: {
    search: async () => ({ block: '', sources: [], scanned: 0, truncated: false }),
    catalog: async () => ({ text: '', paths: [], truncated: false }),
    readSelections: async () => ({ block: '', sources: [], truncated: false }),
    relativeDocPath: async () => undefined
  },
  images: {
    allowRoot: async () => {},
    allowDocument: async () => {}
  },
  emitChat: (event) => events.push(event),
  emitFile: () => {},
  openExternal: async () => {},
  bootstrap: async () => ({}),
  streamChatImpl: async function* () {
    yield '你'
    yield '好'
  }
})

describe('createHandlers', () => {
  it('exposes every channel used by the renderer', () => {
    const handlers = createHandlers(makeDeps([]))
    const outbound = new Set<string>([IPC.fsChanged, IPC.chatEvent, IPC.chatAbort, IPC.menuAction])
    const expected = Object.values(IPC).filter((channel) => !outbound.has(channel))
    for (const channel of expected) expect(handlers[channel]).toBeTypeOf('function')
  })

  it('returns public settings with masked key', async () => {
    const handlers = createHandlers(makeDeps([]))
    const pub = (await handlers[IPC.settingsGet]!()) as { hasApiKey: boolean; baseUrl: string }
    expect(pub.hasApiKey).toBe(false)
    expect(pub.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
  })

  it('forwards catalog reads and refreshes', async () => {
    const snapshot = { updatedAt: 1, checkedAt: 1, providers: { deepseek: [] } }
    const get = vi.fn(async () => snapshot)
    const refresh = vi.fn(async () => snapshot)
    const handlers = createHandlers({ ...makeDeps([]), catalog: { get, refresh } })

    await expect(handlers[IPC.catalogGet]!()).resolves.toBe(snapshot)
    await expect(handlers[IPC.catalogRefresh]!()).resolves.toBe(snapshot)
    expect(get).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('forwards dialog default paths', async () => {
    const pickFolder = vi.fn(async (_defaultPath?: string) => 'D:/docs')
    const pickFile = vi.fn(async (_defaultPath?: string) => 'D:/docs/a.md')
    const handlers = createHandlers({ ...makeDeps([]), pickFolder, pickFile })

    await expect(handlers[IPC.fsPickFolder]!('D:/last')).resolves.toBe('D:/docs')
    await expect(handlers[IPC.fsPickFile]!('D:/docs/ch01')).resolves.toBe('D:/docs/a.md')
    expect(pickFolder).toHaveBeenCalledWith('D:/last')
    expect(pickFile).toHaveBeenCalledWith('D:/docs/ch01')
  })

  it('forwards workspace retrieval and clamps the budget', async () => {
    const search = vi.fn(async () => ({
      block: '片段',
      sources: [{ path: 'a.md', heading: 'A' }],
      scanned: 1,
      truncated: false
    }))
    const deps = makeDeps([])
    deps.workspace.search = search
    const handlers = createHandlers(deps)

    await expect(
      handlers[IPC.workspaceRetrieve]!({
        root: ' D:/docs ',
        question: ' 正规子群 ',
        budget: 10
      })
    ).resolves.toMatchObject({ block: '片段' })
    expect(search).toHaveBeenCalledWith({
      root: 'D:/docs',
      question: '正规子群',
      budget: 1000
    })

    await expect(
      handlers[IPC.workspaceRetrieve]!({ root: '', question: 'q', budget: 5000 })
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' })
    await expect(
      handlers[IPC.workspaceRetrieve]!({ root: 'D:/docs', question: '  ', budget: 5000 })
    ).rejects.toMatchObject({ code: 'WORKSPACE_EMPTY_QUESTION' })
  })

  it('streams chat deltas then a done event', async () => {
    const events: ChatEvent[] = []
    const handlers = createHandlers(makeDeps(events, 'sk-test'))
    await handlers[IPC.chatStart]!({ requestId: 'r1', messages: [{ role: 'user', content: 'hi' }] })
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done'])
    expect(events[0]).toMatchObject({ requestId: 'r1', text: '你' })
  })

  it('passes the persisted protocol and model endpoint to the client', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, 'sk-test', {
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      protocol: 'anthropic',
      apiBase: 'https://opencode.ai/inference/go/anthropic/v1'
    })
    const seen: { protocol?: string; apiBase?: string }[] = []
    deps.streamChatImpl = async function* (input) {
      seen.push(input)
      yield 'ok'
    }
    await createHandlers(deps)[IPC.chatStart]!({
      requestId: 'r-protocol',
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(seen[0]).toMatchObject({
      protocol: 'anthropic',
      apiBase: 'https://opencode.ai/inference/go/anthropic/v1'
    })
  })

  it('passes the thinking mode and emits fallback notices', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, 'sk-test', { thinkingMode: 'deep' })
    const seen: { thinking?: string }[] = []
    deps.streamChatImpl = async function* (input) {
      seen.push(input)
      input.onNotice?.('该模型不支持深度思考，已按自动模式重试')
      yield 'ok'
    }
    await createHandlers(deps)[IPC.chatStart]!({
      requestId: 'r-thinking',
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(seen[0]).toMatchObject({ thinking: 'deep' })
    expect(events.map((event) => event.type)).toEqual(['notice', 'delta', 'done'])
  })

  it('plans files with the model, reads them and emits phases', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, 'sk-test')
    const calls: { messages: { role: string; content: string }[]; thinking?: string }[] = []
    deps.streamChatImpl = async function* (input) {
      calls.push(input)
      if (input.messages[0]?.content.includes('检索规划器')) {
        yield JSON.stringify({
          files: [{ path: 'ch01/1.10.md', heading: 'Sylow' }],
          keywords: ['第一定理']
        })
      } else {
        yield '最终回答'
      }
    }
    deps.workspace.catalog = vi.fn(async () => ({
      text: 'ch01/1.10.md\n  · Sylow',
      paths: ['ch01/1.10.md'],
      truncated: false
    }))
    deps.workspace.relativeDocPath = vi.fn(async () => 'ch01/1.1.md')
    deps.workspace.readSelections = vi.fn(async () => ({
      block: '【参考文件】\n── ch01/1.10.md §Sylow ──\nSylow 定理内容',
      sources: [{ path: 'ch01/1.10.md', heading: 'Sylow' }],
      truncated: false
    }))

    await createHandlers(deps)[IPC.chatStart]!({
      requestId: 'r-ai',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: '当前文档上下文' },
        { role: 'user', content: 'Sylow 定理怎么证明' }
      ],
      workspace: {
        root: 'D:/docs',
        docPath: 'D:/docs/ch01/1.1.md',
        question: 'Sylow 定理怎么证明',
        budget: 5000
      }
    })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.messages[0]?.content).toContain('检索规划器')
    expect(calls[0]?.thinking).toBe('off')
    expect(deps.workspace.readSelections).toHaveBeenCalledWith(
      'D:/docs',
      [{ path: 'ch01/1.10.md', heading: 'Sylow' }],
      expect.objectContaining({ budget: 5000, currentDocPath: 'D:/docs/ch01/1.1.md' })
    )
    const finalMessages = calls[1]!.messages
    expect(finalMessages.some((message) => message.content.includes('Sylow 定理内容'))).toBe(true)
    expect(finalMessages.at(-1)?.content).toBe('Sylow 定理怎么证明')
    expect(events.map((event) => event.type)).toEqual([
      'phase',
      'phase',
      'sources',
      'phase',
      'delta',
      'done'
    ])
    expect(events[0]).toMatchObject({ phase: 'planning' })
    expect(events[1]).toMatchObject({ phase: 'reading' })
    expect(events[3]).toMatchObject({ phase: 'answering' })
  })

  it('falls back to local retrieval when the plan is unusable', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, 'sk-test')
    deps.streamChatImpl = async function* (input) {
      if (input.messages[0]?.content.includes('检索规划器')) {
        yield '不是 JSON'
      } else {
        yield '兜底回答'
      }
    }
    deps.workspace.catalog = vi.fn(async () => ({
      text: 'ch01/1.10.md',
      paths: ['ch01/1.10.md'],
      truncated: false
    }))
    deps.workspace.search = vi.fn(async () => ({
      block: '【工作区】本地检索结果',
      sources: [{ path: 'ch01/1.10.md', heading: 'Sylow' }],
      scanned: 1,
      truncated: false
    }))

    await createHandlers(deps)[IPC.chatStart]!({
      requestId: 'r-fallback',
      messages: [{ role: 'user', content: '问题' }],
      workspace: { root: 'D:/docs', question: '问题', budget: 4000 }
    })

    expect(deps.workspace.search).toHaveBeenCalledOnce()
    expect(events.some((event) => event.type === 'notice')).toBe(true)
    expect(events.some((event) => event.type === 'sources')).toBe(true)
    expect(events.some((event) => event.type === 'delta')).toBe(true)
  })

  it('turns a thrown error into an error event', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, 'sk-test')
    deps.streamChatImpl = async function* () {
      throw new Error('boom')
    }
    await createHandlers(deps)[IPC.chatStart]!({ requestId: 'r2', messages: [] })
    expect(events).toEqual([{ type: 'error', requestId: 'r2', message: 'boom' }])
  })

  it('reports a missing api key without calling the model', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events)
    deps.streamChatImpl = async function* () {
      yield '不该出现'
    }
    await createHandlers(deps)[IPC.chatStart]!({ requestId: 'r3', messages: [] })
    expect(events).toEqual([
      { type: 'error', requestId: 'r3', message: '还没有配置 API Key，请到设置里填写' }
    ])
  })

  it('allows local providers to chat without an api key', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, '', { baseUrl: 'http://localhost:11434/v1' })
    await createHandlers(deps)[IPC.chatStart]!({ requestId: 'r4', messages: [] })
    expect(events.map((event) => event.type)).toEqual(['delta', 'delta', 'done'])
  })

  it('still requires a key for remote providers without one', async () => {
    const events: ChatEvent[] = []
    const deps = makeDeps(events, '', { baseUrl: 'http://192.168.1.10:11434/v1' })
    await createHandlers(deps)[IPC.chatStart]!({ requestId: 'r5', messages: [] })
    expect(events).toEqual([
      { type: 'error', requestId: 'r5', message: '还没有配置 API Key，请到设置里填写' }
    ])
  })

  it('rejects openExternal for non-http urls', async () => {
    const opened: string[] = []
    const deps = { ...makeDeps([]), openExternal: async (url: string) => void opened.push(url) }
    const handlers = createHandlers(deps)
    await expect(handlers[IPC.shellOpenExternal]!('file:///C:/x')).rejects.toMatchObject({
      code: 'SHELL_BLOCKED'
    })
    await handlers[IPC.shellOpenExternal]!('https://example.com')
    expect(opened).toEqual(['https://example.com'])
  })
})

describe('registerIpc', () => {
  it('calls ipc.handle for every handler and ipc.on for chatAbort', () => {
    const handled: string[] = []
    const listened: string[] = []
    const handlers = createHandlers(makeDeps([]))
    registerIpc(
      {
        handle: (channel) => void handled.push(channel),
        on: (channel) => void listened.push(channel)
      },
      handlers
    )
    expect(handled).toContain(IPC.settingsGet)
    expect(listened).toEqual([IPC.chatAbort])
    expect(handled).toHaveLength(Object.keys(handlers).length)
  })

  it('rejects with a real Error carrying the chinese message', async () => {
    const listeners = new Map<string, (event: unknown, ...args: never[]) => unknown>()
    registerIpc(
      {
        handle: (channel, listener) => void listeners.set(channel, listener),
        on: () => {}
      },
      createHandlers(makeDeps([]))
    )
    const listener = listeners.get(IPC.fsReadDocument)
    expect(listener).toBeTypeOf('function')

    const run = (): Promise<unknown> => Promise.resolve(listener!({}, 'C:/nope.txt' as never))

    await expect(run()).rejects.toBeInstanceOf(Error)
    await expect(run()).rejects.toMatchObject({
      message: '不是 Markdown 文件：C:/nope.txt'
    })
  })
})
