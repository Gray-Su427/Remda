export const USER_AGENT = 'Remda'

export const endpoint = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}${path}`

export const isOpenCodeBaseUrl = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname === 'opencode.ai'
  } catch {
    return false
  }
}

/** OpenCode / Go 要求客户端标识会话，其它供应商不需要。 */
export const sessionHeaders = (
  baseUrl: string,
  sessionId?: string
): Record<string, string> =>
  isOpenCodeBaseUrl(baseUrl) ? { 'x-opencode-session': sessionId ?? 'remda' } : {}

export const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'User-Agent': USER_AGENT
})

export const bearerHeaders = (
  baseUrl: string,
  apiKey: string,
  sessionId?: string
): Record<string, string> => ({
  ...jsonHeaders(),
  Authorization: `Bearer ${apiKey}`,
  ...sessionHeaders(baseUrl, sessionId)
})

/** Anthropic 原生协议：x-api-key + anthropic-version；OpenCode 网关额外接受 Bearer。 */
export const anthropicHeaders = (
  baseUrl: string,
  apiKey: string,
  sessionId?: string
): Record<string, string> => ({
  ...jsonHeaders(),
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
  ...(isOpenCodeBaseUrl(baseUrl) ? { Authorization: `Bearer ${apiKey}` } : {}),
  ...sessionHeaders(baseUrl, sessionId)
})

/** Gemini 原生协议：Key 走请求头，避免出现在 URL / 日志里。 */
export const googleHeaders = (
  baseUrl: string,
  apiKey: string,
  sessionId?: string
): Record<string, string> => ({
  ...jsonHeaders(),
  'x-goog-api-key': apiKey,
  ...sessionHeaders(baseUrl, sessionId)
})
