/**
 * 内置的 OpenAI 兼容服务商预设。
 *
 * 这里只放「选完就能用」的最小信息：Base URL 与一个可编辑的默认模型。
 * 预设不会落盘，设置里始终以实际保存的 baseUrl 为准（见 matchProviderByBaseUrl）。
 */
export interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
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
    keywords: ['深度求索', '深度', 'ds'],
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    keywords: ['gpt', 'chatgpt', '开放ai'],
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/auto',
    keywords: ['路由', '聚合', 'open router'],
    keyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen3-8B',
    keywords: ['siliconflow', 'silicon flow', '硅基', 'sf'],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak'
  },
  {
    id: 'moonshot',
    name: 'Moonshot（Kimi）',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
    keywords: ['kimi', '月之暗面', 'moonshot ai', 'moonshot'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.3-flash',
    keywords: ['智谱', '智谱清言', 'glm', 'bigmodel', 'chatglm'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
  },
  {
    id: 'dashscope',
    name: '阿里通义（百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.5-flash',
    keywords: ['通义', '通义千问', '千问', 'qwen', '阿里云', '百炼', 'dashscope'],
    keyUrl: 'https://bailian.console.aliyun.com/'
  },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    keywords: ['谷歌', 'gemini', 'aistudio', 'google ai'],
    keyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'anthropic',
    name: 'Anthropic（Claude）',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-5-5',
    keywords: ['claude', '克劳德', 'anthropic'],
    keyUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keywords: ['groqcloud', 'groq cloud'],
    keyUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keywords: ['mistral ai', '米斯特拉尔'],
    keyUrl: 'https://console.mistral.ai/api-keys'
  },
  {
    id: 'xai',
    name: 'xAI（Grok）',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.20-0309-non-reasoning',
    keywords: ['grok', '马斯克', 'x ai'],
    keyUrl: 'https://console.x.ai'
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'Qwen/Qwen3.6-Plus',
    keywords: ['together', 'togetherai'],
    keyUrl: 'https://api.together.ai/settings/api-keys'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar',
    keywords: ['pplx', 'search'],
    keyUrl: 'https://www.perplexity.ai/settings/api'
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen3:8b',
    keywords: ['本地', '本地模型', 'ollama', 'localhost'],
    local: true
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'openai/gpt-oss-20b',
    keywords: ['本地', '本地模型', 'lm studio', 'lmstudio', 'localhost'],
    local: true
  }
]

const normalize = (value: string): string => value.trim().toLowerCase()

const normalizeUrl = (value: string): string => normalize(value).replace(/\/+$/, '')

const searchableText = (provider: ProviderPreset): string[] => [
  provider.name,
  provider.id,
  provider.baseUrl,
  ...provider.keywords
]

/**
 * 按关键词过滤服务商；空格分隔的多个关键词需全部命中。
 * 空查询返回完整列表。
 */
export function searchProviders(query: string): ProviderPreset[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return PROVIDERS
  return PROVIDERS.filter((provider) => {
    const fields = searchableText(provider).map(normalize)
    return terms.every((term) => fields.some((field) => field.includes(term)))
  })
}

/** 根据已保存的 baseUrl 反推服务商；忽略大小写与结尾斜杠。 */
export function matchProviderByBaseUrl(baseUrl: string): ProviderPreset | null {
  const target = normalizeUrl(baseUrl)
  if (!target) return null
  return PROVIDERS.find((provider) => normalizeUrl(provider.baseUrl) === target) ?? null
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
