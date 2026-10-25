/** @vitest-environment node */
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '@shared/types'
import { ConversationStore } from './conversationStore'

let dir: string
const msg = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({
  id,
  role,
  content,
  createdAt: Number(id)
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'remda-conv-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('ConversationStore', () => {
  it('returns an empty array for an unknown document', async () => {
    const store = new ConversationStore(dir)
    await expect(store.load('D:/a.md')).resolves.toEqual([])
  })

  it('round-trips messages per document', async () => {
    const store = new ConversationStore(dir)
    const messages = [msg('1', 'user', '问'), msg('2', 'assistant', '答')]
    await store.save('D:/a.md', messages)
    await expect(store.load('D:/a.md')).resolves.toEqual(messages)
    await expect(store.load('D:/b.md')).resolves.toEqual([])
  })

  it('keeps only the latest 200 messages', async () => {
    const store = new ConversationStore(dir)
    const many = Array.from({ length: 260 }, (_, i) => msg(String(i), 'user', `m${i}`))
    await store.save('D:/a.md', many)
    const loaded = await store.load('D:/a.md')
    expect(loaded).toHaveLength(200)
    expect(loaded[0]?.content).toBe('m60')
  })

  it('clears a conversation without touching the directory', async () => {
    const store = new ConversationStore(dir)
    await store.save('D:/a.md', [msg('1', 'user', 'q')])
    await store.clear('D:/a.md')
    await expect(store.load('D:/a.md')).resolves.toEqual([])
    expect(await readdir(dir)).toEqual([])
  })
})
