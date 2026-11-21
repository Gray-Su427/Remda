import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import type { ChatEvent } from '@shared/ipc'
import { installMockRemda, defaultSettings } from '../test/mockRemda'
import { useSettingsStore } from './settingsStore'
import { useWorkspaceStore } from './workspaceStore'
import { useChatStore } from './chatStore'

let emit: (event: ChatEvent) => void = () => {}

function setupApi(): ReturnType<typeof installMockRemda> {
  let handler: ((event: ChatEvent) => void) | null = null
  const api = installMockRemda()
  api.chat.onEvent = vi.fn((cb: (event: ChatEvent) => void) => {
    handler = cb
    return () => {
      handler = null
    }
  })
  emit = (event) => handler?.(event)
  return api
}

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    streaming: false,
    phase: 'idle',
    activeRequestId: null,
    quote: null,
    error: null
  })
  useWorkspaceStore.setState({
    root: null,
    currentDoc: {
      path: 'D:/docs/a.md',
      name: 'a.md',
      content: '# 标题\n\n正文内容\n',
      mtimeMs: 1,
      size: 20
    },
    error: null
  })
  useSettingsStore.setState({ settings: defaultSettings })
})

describe('chatStore', () => {
  it('streams deltas into the assistant message', async () => {
    const api = setupApi()
    await act(async () => {
      await useChatStore.getState().send('这是什么？')
    })
    const requestId = useChatStore.getState().activeRequestId!
    expect(api.chat.start).toHaveBeenCalledOnce()
    act(() => {
      emit({ type: 'delta', requestId, text: '这是' })
      emit({ type: 'delta', requestId, text: '回答' })
    })
    expect(useChatStore.getState().messages.at(-1)?.content).toBe('这是回答')
    act(() => emit({ type: 'done', requestId }))
    expect(useChatStore.getState().streaming).toBe(false)
    await waitFor(() => expect(api.conversations.save).toHaveBeenCalled())
  })

  it('keeps partial text and records the error', async () => {
    setupApi()
    await act(async () => {
      await useChatStore.getState().send('q')
    })
    const requestId = useChatStore.getState().activeRequestId!
    act(() => {
      emit({ type: 'delta', requestId, text: '半截' })
      emit({ type: 'error', requestId, message: '无法连接' })
    })
    const last = useChatStore.getState().messages.at(-1)
    expect(last?.content).toBe('半截')
    expect(last?.error).toBe('无法连接')
    expect(useChatStore.getState().streaming).toBe(false)
  })

  it('stop() aborts the active request and unlocks input', async () => {
    const api = setupApi()
    await act(async () => {
      await useChatStore.getState().send('q')
    })
    const requestId = useChatStore.getState().activeRequestId
    await act(async () => {
      await useChatStore.getState().stop()
    })
    expect(api.chat.abort).toHaveBeenCalledWith(requestId)
    expect(useChatStore.getState().streaming).toBe(false)
  })

  it('does not send an empty question or while streaming', async () => {
    const api = setupApi()
    await act(async () => {
      await useChatStore.getState().send('   ')
    })
    expect(api.chat.start).not.toHaveBeenCalled()
    useChatStore.setState({ streaming: true })
    await act(async () => {
      await useChatStore.getState().send('q')
    })
    expect(api.chat.start).not.toHaveBeenCalled()
  })

  it('clear() wipes messages and the stored conversation', async () => {
    const api = setupApi()
    await act(async () => {
      await useChatStore.getState().clear()
    })
    expect(useChatStore.getState().messages).toEqual([])
    expect(api.conversations.clear).toHaveBeenCalledWith('D:/docs/a.md')
  })

  it('blocks remote providers without an api key', async () => {
    const api = setupApi()
    useSettingsStore.setState({
      settings: { ...defaultSettings, hasApiKey: false, apiKeyHint: '', apiKeyHints: {} }
    })
    await act(async () => {
      await useChatStore.getState().send('q')
    })
    expect(api.chat.start).not.toHaveBeenCalled()
    expect(useChatStore.getState().error).toContain('API Key')
  })

  it('allows local providers without an api key', async () => {
    const api = setupApi()
    useSettingsStore.setState({
      settings: {
        ...defaultSettings,
        baseUrl: 'http://localhost:11434/v1',
        hasApiKey: false,
        apiKeyHint: '',
        apiKeyHints: {}
      }
    })
    await act(async () => {
      await useChatStore.getState().send('q')
    })
    expect(api.chat.start).toHaveBeenCalledOnce()
  })

  it('retrieves workspace sources and appends them to the context', async () => {
    const api = setupApi()
    useWorkspaceStore.setState({ root: 'D:/docs' })
    api.workspace.retrieve = vi.fn(async () => ({
      block: '【工作区】书库\n【参考文件】\n── ch01/1.1.md §群 ──\n群的定义。',
      sources: [{ path: 'ch01/1.1.md', heading: '群' }],
      scanned: 2,
      truncated: false
    }))

    await act(async () => {
      await useChatStore.getState().send('什么是群')
    })

    expect(api.workspace.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ root: 'D:/docs', docPath: 'D:/docs/a.md', question: '什么是群' })
    )
    const request = vi.mocked(api.chat.start).mock.calls[0]![0]
    expect(request.messages[1]?.content).toContain('【工作区】书库')
    const last = useChatStore.getState().messages.at(-1)
    expect(last?.sources).toEqual([{ path: 'ch01/1.1.md', heading: '群' }])
  })

  it('still answers when workspace retrieval fails', async () => {
    const api = setupApi()
    useWorkspaceStore.setState({ root: 'D:/docs' })
    api.workspace.retrieve = vi.fn(async () => {
      throw new Error('磁盘错误')
    })

    await act(async () => {
      await useChatStore.getState().send('q')
    })

    expect(api.chat.start).toHaveBeenCalledOnce()
    expect(useChatStore.getState().messages.at(-1)?.notice).toContain('工作区检索失败')
  })

  it('skips retrieval when the setting is off', async () => {
    const api = setupApi()
    useWorkspaceStore.setState({ root: 'D:/docs' })
    useSettingsStore.setState({ settings: { ...defaultSettings, workspaceSearch: false } })

    await act(async () => {
      await useChatStore.getState().send('q')
    })

    expect(api.workspace.retrieve).not.toHaveBeenCalled()
    expect(api.chat.start).toHaveBeenCalledOnce()
  })

  it('records non-fatal notices on the assistant message', async () => {
    setupApi()
    await act(async () => {
      await useChatStore.getState().send('q')
    })
    const requestId = useChatStore.getState().activeRequestId!
    act(() => emit({ type: 'notice', requestId, message: '已按自动模式重试' }))
    expect(useChatStore.getState().messages.at(-1)?.notice).toBe('已按自动模式重试')
  })
})
