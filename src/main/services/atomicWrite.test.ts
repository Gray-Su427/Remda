/** @vitest-environment node */
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeJsonAtomic } from './atomicWrite'

let dir: string | undefined

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

describe('writeJsonAtomic', () => {
  it('writes pretty json and leaves no temp files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'remda-atomic-'))
    const file = join(dir, 'a.json')
    await writeJsonAtomic(file, { a: 1 })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ a: 1 })
    expect(await readdir(dir)).toEqual(['a.json'])
  })
})
