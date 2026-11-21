import { matchProviderByBaseUrl } from '@shared/providers'
import type { ThinkingMode } from '@shared/types'

export interface ThinkingInput {
  baseUrl: string
  model: string
  thinking?: ThinkingMode
}

/** 只用来决定「关闭」时要不要发 effort，避免对普通模型发不支持的字段。 */
const REASONING_MODEL = /(^|[/:_-])(o[1-9]|gpt-5|gpt-6|reasoner|thinking|qwq)/i

const isReasoningModel = (model: string): boolean => REASONING_MODEL.test(model)

/**
 * OpenAI Chat Completions：
 * - DeepSeek 用 thinking + reasoning_effort
 * - OpenRouter 用统一的 reasoning 对象
 * - 其它兼容网关在「深入」时尝试 reasoning_effort，失败由 client 回退
 */
export function openaiChatThinking(input: ThinkingInput): Record<string, unknown> {
  const thinking = input.thinking ?? 'auto'
  if (thinking === 'auto') return {}
  const providerId = matchProviderByBaseUrl(input.baseUrl)?.id

  if (providerId === 'deepseek') {
    return thinking === 'off'
      ? { thinking: { type: 'disabled' } }
      : { thinking: { type: 'enabled' }, reasoning_effort: 'max' }
  }
  if (providerId === 'openrouter') {
    return { reasoning: { effort: thinking === 'off' ? 'none' : 'high' } }
  }
  if (thinking === 'deep') return { reasoning_effort: 'high' }
  return isReasoningModel(input.model) ? { reasoning_effort: 'minimal' } : {}
}

/** Responses 的 reasoning 对象放在顶层。 */
export function openaiResponsesThinking(input: ThinkingInput): Record<string, unknown> {
  const thinking = input.thinking ?? 'auto'
  if (thinking === 'auto') return {}
  if (thinking === 'deep') return { reasoning: { effort: 'high', summary: 'auto' } }
  return isReasoningModel(input.model) ? { reasoning: { effort: 'minimal' } } : {}
}

/** Anthropic 扩展思考需要预算，且 max_tokens 必须大于 budget_tokens。 */
export function anthropicThinking(input: ThinkingInput): Record<string, unknown> {
  return input.thinking === 'deep'
    ? { thinking: { type: 'enabled', budget_tokens: 4096 } }
    : {}
}

/** Gemini 的 thinking 配置位于 generationConfig 里。 */
export function googleThinking(input: ThinkingInput): Record<string, unknown> {
  return input.thinking === 'deep'
    ? { thinkingConfig: { includeThoughts: true, thinkingBudget: 4096 } }
    : {}
}
