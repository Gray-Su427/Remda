/**
 * 内置的 OpenAI 兼容服务商预设。
 *
 * 这里放「选完就能用」的最小信息：Base URL、默认模型和可选模型列表。
 * 模型列表只是离线兜底，联网后会由 models.dev 目录覆盖（见 modelCatalog）。
 * 预设不会落盘，设置里始终以实际保存的 baseUrl 为准（见 matchProviderByBaseUrl）。
 */
export interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  /** 常用模型，必须包含 defaultModel；联网后用 models.dev 的最新目录替换 */
  models: string[]
  /** 搜索别名（中英文、简称），大小写不敏感 */
  keywords: string[]
  /** 「获取 API Key」页面；本地服务商没有 */
  keyUrl?: string
  /** 本地服务（Ollama / LM Studio），不需要 API Key */
  local?: boolean
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro'],
    keywords: ['深度求索', '深度', 'ds'],
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5-mini', 'gpt-5', 'gpt-4.1', 'gpt-4o-mini', 'o4-mini'],
    keywords: ['gpt', 'chatgpt', '开放ai'],
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/auto',
    models: [
      'openrouter/auto',
      'moonshotai/kimi-k3.1-pro',
      'deepseek/deepseek-v4.1-flash-1017',
      'minimax/minimax-m3.1-flash',
      'openai/gpt-5.4-mini',
      'anthropic/claude-sonnet-5.5',
      'google/gemini-3.8-flash'
    ],
    keywords: ['路由', '聚合', 'open router'],
    keyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen3-8B',
    models: [
      'Qwen/Qwen3-8B',
      'zai-org/GLM-5.3-Flash',
      'deepseek-ai/DeepSeek-V4-Flash-0731',
      'moonshotai/Kimi-K3',
      'Qwen/Qwen3.6-35B-A3B',
      'MiniMaxAI/MiniMax-M3'
    ],
    keywords: ['siliconflow', 'silicon flow', '硅基', 'sf'],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak'
  },
  {
    id: 'moonshot',
    name: 'Moonshot（Kimi）',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
    models: ['kimi-k3', 'kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k2.7-code', 'kimi-k2.6'],
    keywords: ['kimi', '月之暗面', 'moonshot ai', 'moonshot'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.3-flash',
    models: ['glm-5.3-flash', 'glm-5.3-flashx', 'glm-5.3', 'glm-5.1', 'glm-4.6'],
    keywords: ['智谱', '智谱清言', 'glm', 'bigmodel', 'chatglm'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
  },
  {
    id: 'dashscope',
    name: '阿里通义（百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.5-flash',
    models: ['qwen3.5-flash', 'qwen3.8-flash', 'qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash'],
    keywords: ['通义', '通义千问', '千问', 'qwen', '阿里云', '百炼', 'dashscope'],
    keyUrl: 'https://bailian.console.aliyun.com/'
  },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview'
    ],
    keywords: ['谷歌', 'gemini', 'aistudio', 'google ai'],
    keyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'anthropic',
    name: 'Anthropic（Claude）',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-5-5',
    models: [
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
      'claude-opus-4-8'
    ],
    keywords: ['claude', '克劳德', 'anthropic'],
    keyUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.6-27b'
    ],
    keywords: ['groqcloud', 'groq cloud'],
    keyUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: [
      'mistral-small-latest',
      'mistral-medium-latest',
      'mistral-large-4',
      'devstral-latest',
      'codestral-latest'
    ],
    keywords: ['mistral ai', '米斯特拉尔'],
    keyUrl: 'https://console.mistral.ai/api-keys'
  },
  {
    id: 'xai',
    name: 'xAI（Grok）',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.20-0309-non-reasoning',
    models: [
      'grok-4.20-0309-non-reasoning',
      'grok-4.20-0309-reasoning',
      'grok-4.7',
      'grok-4.6',
      'grok-4.5',
      'grok-4.3'
    ],
    keywords: ['grok', '马斯克', 'x ai'],
    keyUrl: 'https://console.x.ai'
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'Qwen/Qwen3.6-Plus',
    models: [
      'Qwen/Qwen3.6-Plus',
      'Qwen/Qwen3.7-Max',
      'deepseek-ai/DeepSeek-V4.1-Flash',
      'moonshotai/Kimi-K3',
      'zai-org/GLM-5.3',
      'meta-llama/Llama-3.3-70B-Instruct-Turbo'
    ],
    keywords: ['together', 'togetherai'],
    keyUrl: 'https://api.together.ai/settings/api-keys'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar',
    models: ['sonar', 'sonar-pro', 'sonar-reasoning-pro', 'sonar-deep-research'],
    keywords: ['pplx', 'search'],
    keyUrl: 'https://www.perplexity.ai/settings/api'
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen3:8b',
    models: ['qwen3:8b', 'qwen3:4b', 'llama3.2', 'llama3.1:8b', 'deepseek-r1:8b'],
    keywords: ['本地', '本地模型', 'ollama', 'localhost'],
    local: true
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'openai/gpt-oss-20b',
    models: ['openai/gpt-oss-20b', 'qwen/qwen3-30b-a3b-2507', 'qwen/qwen3-coder-30b'],
    keywords: ['本地', '本地模型', 'lm studio', 'lmstudio', 'localhost'],
    local: true
  }
]

const normalize = (value: string): string => value.trim().toLowerCase()

/** 用于给 API Key 分组/反查的 Base URL 规范形式（忽略大小写与结尾斜杠）。 */
export function baseUrlKey(baseUrl: string): string {
  return normalize(baseUrl).replace(/\/+$/, '')
}

/** 根据已保存的 baseUrl 反推服务商；忽略大小写与结尾斜杠。 */
export function matchProviderByBaseUrl(baseUrl: string): ProviderPreset | null {
  const target = baseUrlKey(baseUrl)
  if (!target) return null
  return PROVIDERS.find((provider) => baseUrlKey(provider.baseUrl) === target) ?? null
}

/** 仅 localhost / 127.0.0.1 / [::1] 视为本地服务，可不需要 API Key。 */
export function isLoopbackBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}
