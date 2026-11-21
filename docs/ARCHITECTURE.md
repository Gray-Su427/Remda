# Remda 架构

Remda（read md with ai）是 Electron 桌面应用：左侧渲染本地 Markdown，右侧调用 OpenAI 兼容模型陪读。
本文说明进程职责、IPC 契约、上下文裁剪算法与安全边界。

## 1. 进程职责

```
renderer (React + Zustand)
  ├─ FileTree      ← window.remda.fs.readTree
  ├─ ReaderPane    ← window.remda.fs.readDocument + 本地 Markdown 渲染
  ├─ SettingsDialog / SearchPicker ← shared/providerPresets + catalog:get
  └─ ChatPane      → window.remda.chat.start
        │
        │ window.remda（preload contextBridge，类型化）
        ▼
preload（只做 IPC 转发，无业务逻辑）
        │
        ▼
main（Electron 主进程）
  ├─ fsService            文件树 / 文档读取 / chokidar 监听
  ├─ SettingsStore        settings.json + safeStorage 加密 API Key
  ├─ ModelCatalog         models.dev 模型目录 + ETag + 本地缓存
  ├─ ConversationStore    userData/conversations/<sha1(docPath)>.json
  ├─ ImageProxy           remda-img:// 图片代理（http / 本地相对路径）
  ├─ llm/client           协议分发（OpenAI Chat / Responses / Anthropic / Gemini）
  ├─ llm/protocols        每种协议的请求体、鉴权头与流事件解析
  └─ ipc/register         全部 handler 装配，可注入 ipcMain 便于单测
```

**主进程负责**：文件系统、设置与密钥、会话持久化、LLM 网络请求、模型目录更新、外链打开。
**渲染进程负责**：Markdown 渲染（unified）、布局与交互、上下文组装（纯函数 `buildChatContext`）。
**渲染进程不接触**：Node API、API Key 明文、`fs`/`net`。

## 2. IPC 通道表（唯一来源 `src/shared/ipc.ts`）

| 通道 | 方向 | 说明 |
|---|---|---|
| `fs:pickFolder` / `fs:pickFile` | invoke | 系统对话框选目录 / 选 md 文件 |
| `fs:readTree` | invoke | 递归读目录树（跳过 dotfile、node_modules 等），同时登记图片根目录 |
| `fs:readDocument` | invoke | 读单个 md（> 5MB 拒绝，仅 md/markdown/mdx），同时登记该文档的图片目录 |
| `fs:watch` / `fs:unwatch` | invoke | chokidar 监听 / 取消，200ms 防抖 |
| `fs:changed` | main → renderer | `{ type: 'change' \| 'unlink', path }` |
| `workspace:retrieve` | invoke | 在已打开文件夹里检索相关 Markdown 小节，返回目录、片段与来源 |
| `settings:get` | invoke | 返回 `PublicSettings`（当前 Key 掩码 + 各地址 `apiKeyHints` + 协议） |
| `settings:save` | invoke | 合并补丁；Key 省略表示保持不变，空字符串表示删除该地址的 Key |
| `settings:test` | invoke | 按 `protocol` / `apiBase` 请求 `/models` 探活；未填 Key 时按 `baseUrl` 取已保存的 Key |
| `catalog:get` | invoke | 读取模型目录缓存（可能为空，不联网） |
| `catalog:refresh` | invoke | 联网刷新 models.dev 目录；失败时返回旧快照 + `lastError` |
| `chat:start` | invoke | 请求体为完整 messages；整段生成结束后 resolve |
| `chat:abort` | send | 按 `requestId` 中止 |
| `chat:event` | main → renderer | `delta` / `notice` / `done` / `error` |
| `conv:load` / `conv:save` / `conv:clear` | invoke | 按文档路径读写会话（最多 200 条） |
| `shell:openExternal` | invoke | 仅放行 `http:` / `https:` |
| `app:bootstrap` | invoke | 启动信息（E2E 自动打开文档） |

主进程 handler 的错误统一归一化为 `{ code, message }`，`message` 为可直接展示的中文文案。

## 3. 上下文预算与工作区检索

### 3.1 当前文档（`src/shared/chat/context.ts`）

1. `budget = max(settings.maxContextChars, 800)`，默认 24000 字符。
2. 选区：始终附带，最多 8000 字符，超出标记「已截断」。
3. 若 `markdown.length + outline.length <= budget` → **注入全文**。
4. 否则若已知当前小节（滚动同步得到的 `github-slugger` id）→ 注入
   **全文目录 + 当前小节 ± 相邻各两节**，按「当前 → 前一节 → 后一节 → 前二 → 后二」顺序填空，超出预算的跳过。
5. 否则（未定位）→ 注入文档开头 `budget - outline.length` 字符。
6. 提示词固定为：system → 上下文（user）→ 最近 20 条历史 → 本轮问题。
   带 `error` 的空/半截回复不进历史。

### 3.2 工作区检索（`workspace:retrieve`）

打开文件夹且 `workspaceSearch` 开启时，渲染层先取当前文档预算的 55%，剩余字符留给检索：

1. 主进程 `WorkspaceIndex` 递归扫描工作区，跳过 dotfile、`node_modules`、`dist`、`out`、`release`、
   `.git`、`.vite` 和符号链接，只收 md/markdown/mdx；
2. 上限 1000 个文件、单文件 2MB、总读取 64MB，超出标记 `truncated`；
3. 用轻量标题扫描切成小节，按 `mtime + size` 缓存文件内容，目录扫描 3 秒内复用；
4. `src/shared/chat/retrieval.ts` 做中文二元组 / 英文词分词，按文件名、标题、正文做 IDF 加权，
   编号（如 `1.10.3`）和 README / INDEX / 索引 / 映射表等索引文件额外加分；
5. 每个文件最多取 2 个小节，最多 6 段，按预算裁剪；当前文档已在上下文中，不重复检索；
6. 结果以「工作区目录 + 参考文件（相对路径 §小节）」注入到当前文档之后，
   `sources` 同时返回给渲染层，在回答下方显示「参考 N 个文件」。

检索失败、没有打开文件夹或设置关闭时，静默回退到单文档上下文，不影响本轮回答。

### 3.3 跨文件提示词

`SYSTEM_PROMPT` 要求模型先给结论、再给依据；参考文件引用格式为「（相对路径 §小节标题）」，
当前文档可只写「（§小节标题）」；资料里没有的内容必须明说，不得编造定理编号或页码。

## 4. 为什么禁用 raw HTML

`remark-rehype` 未开启 `allowDangerousHtml`，md 里的 `<script>`、`<img onerror>` 会被直接丢弃；
渲染结果再由 `dangerouslySetInnerHTML` 挂载，因此不存在 md 内联 HTML 的执行面。
外链点击一律 `preventDefault` 后经主进程 `shell.openExternal` 打开，且只允许 http/https；
`#` 锚点在阅读器内部滚动，不触发外链。

> 原始 HTML 里的 `<img>` 同样会被丢弃；图片请使用标准 Markdown 语法 `![](url)`，具体加载规则见 §9。

## 5. API Key 的保存路径

```
renderer 输入 Key
  → settings:save(Partial<SettingsInput>)
  → SettingsStore.save（渲染端永远不读回明文）
  → safeStorage.encryptString(key) → base64
  → settings.json {
      version: 2,
      settings: {
        baseUrl, protocol, apiBase, model,
        temperature, maxContextChars, theme
      },
      apiKeys: { "<规范化 baseUrl>": "enc:<base64>" }
    }
使用：
  → chat:start → SettingsStore.load() 按当前 baseUrl 解密对应 Key → streamChat({ protocol, apiBase, ... })
  → settings:test → SettingsStore.resolveApiKey(input.baseUrl)
```

- Key 按规范化 Base URL（去尾斜杠、忽略大小写）分组，一个服务商一把；只写非空条目，
  没有输入过 Key 的地址不会出现在 `apiKeys` 里。
- 读取 v1 文件时自动迁移：旧的 `apiKeyEnc` 归到当时 `baseUrl` 下，其他服务商需要重新填写一次。
- `safeStorage.isEncryptionAvailable()` 为 false 时回退 `plain:` 前缀（README 有说明），
  仍然只有主进程读取该文件；渲染进程拿到的只有 `hasApiKey` / `apiKeyHint` 与
  `apiKeyHints`（规范化 URL → 掩码，例如 `sk-••••1234`）。
- Key 只在主进程内存在；不写入日志、不进 IPC 响应、不进渲染进程内存。
- 服务商预设（`src/shared/providers.ts`）只用于设置界面的搜索与自动填充，
  实际生效的始终是 settings.json 里的 `baseUrl` / `protocol` / `apiBase` / `model`；
  预设本身不持久化。
- `protocol` 与 `apiBase` 在保存时由设置页从「供应商预设 + 模型目录」解析后写入；
  只改 `baseUrl` 时会重置为该供应商的默认协议，避免沿用上一家的配置。
  旧版本没有这两个字段时，按 `baseUrl` 匹配预设推断（例如 Anthropic → `anthropic`）。
- 本地服务商（`localhost` / `127.0.0.1` / `[::1]`）允许空 Key，便于 Ollama / LM Studio；
  远程地址仍然强制要求 Key（主进程 `chat:start` 抛 `LLM_NO_KEY`，渲染层发送前也会拦截）。

## 6. 多协议适配（`src/main/llm/`）

| 协议 | 请求 | 鉴权 | 文本事件 |
|---|---|---|---|
| `openai-chat` | `POST {base}/chat/completions` | `Authorization: Bearer` | `choices[0].delta.content` |
| `openai-responses` | `POST {base}/responses` | `Authorization: Bearer` | `response.output_text.delta` |
| `anthropic` | `POST {base}/messages` | `x-api-key` + `anthropic-version` | `content_block_delta` 中的 `text_delta` |
| `google` | `POST {base}/models/{id}:streamGenerateContent?alt=sse` | `x-goog-api-key` | `candidates[].content.parts[].text` |

- `sse.ts` 统一解析 SSE（多行 `data:`、CRLF、没有结尾空行），各协议只负责 JSON 事件映射。
- `client.ts` 按 `protocol` 分发，负责网络错误、HTTP 错误与流内错误的统一中文文案；
  `AbortSignal` 贯穿四种协议。
- Anthropic 的 system 消息提到顶层 `system`，`max_tokens` 固定 8192，temperature 夹到 0–1；
  Gemini 的 system 消息转 `systemInstruction`，`assistant` 映射为 `model`，跳过 `thought` part；
  Responses 使用 `input` 数组、`store: false`，不发送 temperature（GPT-6 / Codex 系不支持）。
- `apiBase` 用于网关为不同协议提供不同 endpoint 的情况（例如 OpenCode / Go 的
  `.../anthropic/v1`、`.../google/v1beta`）；缺失时使用 `baseUrl`。
- OpenCode 域名继续发送 `x-opencode-session`；Anthropic 原生协议在该域名下额外带 Bearer。
- 「测试连接」按协议选择鉴权头与 `/models` 地址；配置了公开 `modelsUrl` 的网关仍用 Bearer
  访问其统一模型列表。
- 思考档位（`settings.thinkingMode`，默认 `auto`）：
  - DeepSeek：`deep` 发 `thinking: { type: 'enabled' }` + `reasoning_effort: 'max'`，
    `off` 发 `thinking: { type: 'disabled' }`，`auto` 不传参（服务商默认多数为开启）；
  - OpenRouter：`reasoning: { effort }`；
  - OpenAI 与未知兼容网关：`deep` 发 `reasoning_effort: 'high'`，`off` 只对识别出的推理模型发 `minimal`；
  - Responses：`reasoning: { effort: 'high', summary: 'auto' }`；
  - Anthropic：`thinking: { type: 'enabled', budget_tokens: 4096 }`，同时 temperature 固定为 1；
  - Gemini：`generationConfig.thinkingConfig: { includeThoughts: true, thinkingBudget: 4096 }`。
- 服务商拒绝思考参数（400/422）时，`client.ts` 自动去掉参数重试一次，并通过 `chat:event` 的
  `notice` 提示「已按自动模式重试」；同一 `协议 + baseUrl + model` 会记住不支持，避免重复失败。
- 思考正文不解析、不传输、不落盘；界面只根据「是否已收到正文」显示「正在思考…」或「正在回答…」。
- 本期不覆盖 Azure / Bedrock / Vertex（认证体系不同，需要额外凭据管理），也不做 tool calling。

## 7. 供应商预设（`src/shared/providerPresets.ts`）

- 静态快照 60+ 个主流服务商（含 12 个 coding plan endpoint），
  `id` / `name` / `baseUrl` / `docUrl` / `models` 与 models.dev 对齐；
  `keywords` / `keyUrl` / `modelsUrl` / `defaultModel` / `local` / `aliases` /
  `protocol` / `mixed` 是 Remda 的 UI 与兼容扩展。
- 默认协议是 `openai-chat`；Anthropic 预设显式声明 `protocol: 'anthropic'`。
  OpenAI 预设仍走 chat completions，避免已有配置回归；OpenAI Responses 目前用于
  网关中声明 `@ai-sdk/openai` 的模型。
- `mixed: true` 标记模型协议混杂的网关（OpenCode / Go、coding plan），
  这类供应商的协议与 endpoint 由联网目录里的模型级信息决定。
- `baseUrl` 尽量保持稳定；`aliases` 用于兼容旧地址（例如 DeepSeek 带不带 `/v1`）以及未来
  models.dev 的 `api` 形式，避免升级后已保存配置被识别成「其他（自定义）」。
- `models` 里带 `{ id, name, deprecated?, protocol?, apiBase? }`，与联网目录同构；
  离线时用这份列表，联网后由 models.dev 覆盖。
- 有活跃模型时过滤 deprecated；如果供应商全部模型都 deprecated，保留并标记「已弃用」。
- `modelsUrl` 用于模型列表地址与 Base URL 不同的网关（OpenCode / Go），也用于公开 `/models`
  交叉校验和「测试连接」。
- Azure、Bedrock、Vertex、Cohere、GitHub Copilot 以及带 `${...}` 模板地址的供应商暂不内置。
- 以后要做动态供应商列表，只需把 `PROVIDER_PRESETS` 换成「静态兜底 + 联网目录覆盖」，
  `ProviderPicker` / `SettingsDialog` 的数据结构不用变。

## 8. 模型目录（models.dev）

- 启动时主进程的 `ModelCatalog` 先读 `userData/model-catalog.json`，再后台请求
  `https://models.dev/api.json`；本地列表立即可用，不阻塞窗口。
- 缓存带 `version`（当前 v5）和 `providerIds` 签名。升级后或供应商列表变化时签名不一致，
  会丢掉 ETag 和旧缓存，强制拉一次完整数据并覆盖缓存，避免 304 让新供应商一直拿不到模型。
- 请求带上次的 `ETag`，未变化时返回 304；超时 15s，断网/解析失败时保留旧缓存。
  首次运行且离线时，使用 `src/shared/providerPresets.ts` 里的内置模型列表。
- 解析时读取模型级 `provider.npm/api`：
  - `mixed` 网关把 `@ai-sdk/openai-compatible` / `openai` / `anthropic` / `google`
    分别映射为四种协议，模型级 `api` 与供应商地址不同时写入 `apiBase`；未知协议直接跳过；
  - 非混合供应商保持预设协议，其余供应商仍只保留 `@ai-sdk/openai-compatible`；
  - OpenAI/Google/Anthropic/Groq/Mistral/xAI/Together/Perplexity/DeepInfra/Cerebras/
    OpenRouter/LM Studio 使用手工白名单。
- 有活跃模型时过滤 `status === "deprecated"`；全部 deprecated 的供应商保留模型并打标签。
- 对带 `modelsUrl` 的公开供应商拉取 `/models` 做交叉校验：混合协议供应商只取交集，
  普通供应商以接口列表为准，大列表限制在 300 项，失败时回退 models.dev。
- 只保留 Remda 映射的供应商（`PROVIDERS` 中的 id，`ollama` 除外）与 `output` 含 `text` 的对话模型，
  过滤 embedding / image / audio / tts / rerank 等，按发布时间倒序。
- 渲染进程只通过 `catalog:get` / `catalog:refresh` 读取缓存，不直接联网；请求不携带 API Key。
- 目录只能降低「模型 ID 写错」的概率，不保证账号已开通；设置里始终保留「自定义模型…」入口，
  已保存但目录中没有的模型也会显示为「已保存」。
- E2E（存在 `REMDA_E2E_SETTINGS`）跳过启动刷新，保证测试离线可跑；`REMDA_E2E_PROTOCOL`
  用于让端到端用例跑原生协议。
- `src/main/llm` 对所有请求发送 `User-Agent: Remda`；对 `opencode.ai` 地址额外发送
  `x-opencode-session`（当前使用请求 ID），满足 OpenCode / Go 的客户端标识要求。
- 主进程使用 `app.requestSingleInstanceLock()`：第二个实例直接退出并聚焦已有窗口，
  避免多个进程同时读写 userData/Chromium 缓存。

## 9. 图片加载

- 渲染层（`src/renderer/src/markdown/images.ts`）只改写标准 Markdown 图片：
  - `https://`、`data:image/*` 保持直连；
  - `http://` 改为 `remda-img://remote/?url=...`，由主进程代理；
  - `//host/a.png` 补成 `https://host/a.png`；
  - `./a.png`、`../assets/a.png`、`images/a.png` 按当前文档目录解析后改为
    `remda-img://local/?path=<hex>`；
  - `/assets/a.png` 在打开文件夹时按工作区根目录解析；
  - `file:`、`javascript:`、`blob:` 等协议直接丢弃。
- 每张图片都会加 `loading="lazy"`、`decoding="async"`；http 图片额外保留
  `data-original-src`，加载失败时用于「在浏览器打开」。
- 主进程 `ImageProxy`（`src/main/services/imageProxy.ts`）：
  - 启动前注册 `remda-img` 特权协议，CSP 的 `img-src` 只放行
    `'self' data: https: remda-img:`，不放行 `http:`；
  - remote：只接受 http/https，拒绝带账号密码的 URL；`net.fetch` 拉取，
    15s 超时、20MB 上限，只回传 `Content-Type` / 缓存头，不透传 `Set-Cookie`；
  - local：hex 解码路径 → `realpath` → 允许目录校验 → 扩展名 / 大小校验 → 读文件，
    按扩展名返回 MIME；`Cache-Control: no-store`，文件改动后重新渲染即可看到。
- 本地图片权限边界：
  - 打开文件夹：允许整个工作区；
  - 打开单个文件：允许该文件所在目录及其上一级（支持 `../assets`），更外层拒绝；
  - `realpath` 之后再判断，符号链接无法逃逸；只允许图片扩展名，
    png/jpg/jpeg/gif/webp/avif/bmp/svg/ico。
- 加载失败时 `attachImageFallback` 会把 `<img>` 替换为占位块（alt + 「加载失败」），
  网络图片附带原地址，点击仍走 `shell.openExternal`。
- 原始 HTML `<img>` 仍不支持（不启用 `rehype-raw`），见 §4。

## 10. 测试分层

| 层 | 位置 | 环境 |
|---|---|---|
| 纯逻辑 | `src/shared/**/*.test.ts`、`src/main/**/*.test.ts` | node（文件顶部声明 `@vitest-environment node`） |
| 组件 / store | `src/renderer/**/*.test.tsx` | jsdom + Testing Library（`mockRemda()` 假 `window.remda`） |
| 端到端 | `e2e/smoke.spec.ts` | Playwright `_electron` + 本地 SSE mock LLM |

主进程服务全部写成不依赖 Electron 的纯 TS 模块（密钥盒、对话框、`shell` 均通过依赖注入），
因此可以直接用 Vitest 测试，不需要启动 Electron。
