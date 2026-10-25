/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { httpError } from './errors'

describe('httpError', () => {
  it.each([
    [401, 'LLM_UNAUTHORIZED'],
    [403, 'LLM_UNAUTHORIZED'],
    [404, 'LLM_NOT_FOUND'],
    [429, 'LLM_RATE_LIMITED'],
    [500, 'LLM_SERVER_ERROR'],
    [418, 'LLM_HTTP_ERROR']
  ])('maps %i to %s', (status, code) => {
    expect(httpError(status, 'body').code).toBe(code)
  })
})
