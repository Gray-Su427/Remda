/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
import { createApi } from './api'

function makeIpc() {
  const invoke = vi.fn(async (...args: unknown[]) => args)
  const send = vi.fn()
  const listeners = new Map<string, (event: unknown, payload: unknown) => void>()
  const on = vi.fn((channel: string, cb: (event: unknown, payload: unknown) => void) => {
    listeners.set(channel, cb)
  })
  const removeListener = vi.fn((channel: string) => listeners.delete(channel))
  return { invoke, send, on, removeListener, listeners }
}

describe('createApi', () => {
  it('routes file calls through invoke with the exact channel', async () => {
    const ipc = makeIpc()
    const api = createApi(ipc)
    await api.fs.readTree('D:/docs')
    expect(ipc.invoke).toHaveBeenCalledWith(IPC.fsReadTree, 'D:/docs')
  })

  it('routes catalog calls through invoke', async () => {
    const ipc = makeIpc()
    const api = createApi(ipc)
    await api.catalog.get()
    expect(ipc.invoke).toHaveBeenCalledWith(IPC.catalogGet)
    await api.catalog.refresh()
    expect(ipc.invoke).toHaveBeenCalledWith(IPC.catalogRefresh)
  })

  it('subscribes and unsubscribes chat events', () => {
    const ipc = makeIpc()
    const api = createApi(ipc)
    const received: string[] = []
    const off = api.chat.onEvent((e) => received.push(e.type))
    ipc.listeners.get(IPC.chatEvent)?.({}, { type: 'done', requestId: 'r1' })
    off()
    expect(received).toEqual(['done'])
    expect(ipc.removeListener).toHaveBeenCalledWith(IPC.chatEvent, expect.any(Function))
  })

  it('sends abort as fire-and-forget', async () => {
    const ipc = makeIpc()
    await createApi(ipc).chat.abort('r1')
    expect(ipc.send).toHaveBeenCalledWith(IPC.chatAbort, 'r1')
  })
})
