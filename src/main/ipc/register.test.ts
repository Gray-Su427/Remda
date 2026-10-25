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
    const outbound = new Set<string>([IPC.fsChanged, IPC.chatEvent, IPC.chatAbort])
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

  it('streams chat deltas then a done event', async () => {
    const events: ChatEvent[] = []
    const handlers = createHandlers(makeDeps(events, 'sk-test'))
    await handlers[IPC.chatStart]!({ requestId: 'r1', messages: [{ role: 'user', content: 'hi' }] })
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done'])
    expect(events[0]).toMatchObject({ requestId: 'r1', text: '你' })
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
