import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatMessage } from '@shared/types'
import { writeJsonAtomic } from './atomicWrite'

const MAX_MESSAGES = 200

export class ConversationStore {
  constructor(private readonly dir: string) {}

  private file(docPath: string): string {
    const hash = createHash('sha1').update(docPath).digest('hex')
    return join(this.dir, `${hash}.json`)
  }

  async load(docPath: string): Promise<ChatMessage[]> {
    const raw = await readFile(this.file(docPath), 'utf8').catch(() => null)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as { messages?: ChatMessage[] }
      return Array.isArray(parsed.messages) ? parsed.messages : []
    } catch {
      return []
    }
  }

  async save(docPath: string, messages: ChatMessage[]): Promise<void> {
    await writeJsonAtomic(this.file(docPath), {
      docPath,
      updatedAt: Date.now(),
      messages: messages.slice(-MAX_MESSAGES)
    })
  }

  async clear(docPath: string): Promise<void> {
    await rm(this.file(docPath), { force: true })
  }
}
