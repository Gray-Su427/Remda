/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { readErrorMessage } from './errors'

describe('readErrorMessage', () => {
  it('strips the electron ipc wrapper prefix', () => {
    const error = new Error("Error invoking remote method 'fs:readDocument': 文件不存在：D:/x.md")
    expect(readErrorMessage(error)).toBe('文件不存在：D:/x.md')
  })

  it('strips a leading Error: prefix', () => {
    expect(readErrorMessage(new Error("Error invoking remote method 'x': Error: 出错了"))).toBe('出错了')
  })

  it('returns plain messages unchanged', () => {
    expect(readErrorMessage(new Error('触发限流（429），请稍后再试'))).toBe('触发限流（429），请稍后再试')
  })

  it('reads a plain { code, message } object', () => {
    expect(readErrorMessage({ code: 'FS_NOT_FOUND', message: '文件不存在：D:/y.md' })).toBe(
      '文件不存在：D:/y.md'
    )
  })

  it('handles strings', () => {
    expect(readErrorMessage('boom')).toBe('boom')
  })

  it('falls back to String() for unknown values', () => {
    expect(readErrorMessage(42)).toBe('42')
  })
})
