import { AppError } from '@shared/errors'

export function httpError(status: number, body: string): AppError {
  const detail = body.slice(0, 300)
  if (status === 401 || status === 403) {
    return new AppError('LLM_UNAUTHORIZED', 'API Key 无效或无权限，请到设置里检查')
  }
  if (status === 404) {
    return new AppError('LLM_NOT_FOUND', `baseURL 或 model 不存在（404）。${detail}`)
  }
  if (status === 429) {
    return new AppError('LLM_RATE_LIMITED', '触发限流（429），请稍后再试')
  }
  if (status >= 500) {
    return new AppError('LLM_SERVER_ERROR', `模型服务异常（${status}）。${detail}`)
  }
  return new AppError('LLM_HTTP_ERROR', `请求失败（${status}）。${detail}`)
}
