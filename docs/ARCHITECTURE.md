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
  ├─ llm/openaiClient     fetch + SSE 手工解析（支持 AbortSignal）
  └─ ipc/register         全部 handler 装配，可注入 ipcMain 便于单测
```

**主进程负责**：文件系统、设置与密钥、会话持久化、LLM 网络请求、模型目录更新、外链打开。
**渲染进程负责**：Markdown 渲染（unified）、布局与交互、上下文组装（纯函数 `buildChatContext`）。
**渲染进程不接触**：Node API、API Key 明文、`fs`/`net`。

## 2. IPC 通道表（唯一来源 `src/shared/ipc.ts`）

| 通道 | 方向 | 说明 |
|---|---|---|
| `fs:pickFolder` / `fs:pickFile` | invoke | 系统对话框选目录 / 选 md 文件 |
| `fs:readTree` | invoke | 递归读目录树（跳过 dotfile、node_modules 等） |
| `fs:readDocument` | invoke | 读单个 md（> 5MB 拒绝，仅 md/markdown/mdx） |
| `fs:watch` / `fs:unwatch` | invoke | chokidar 监听 / 取消，200ms 防抖 |
| `fs:changed` | main → renderer | `{ type: 'change' \| 'unlink', path }` |
| `settings:get` | invoke | 返回 `PublicSettings`（当前 Key 掩码 + 各地址 `apiKeyHints`） |
| `settings:save` | invoke | 合并补丁；Key 省略表示保持不变，空字符串表示删除该地址的 Key |
| `settings:test` | invoke | `GET {modelsUrl ?? baseUrl}/models` 探活；未填 Key 时按 `baseUrl` 取已保存的 Key |
| `catalog:get` | invoke | 读取模型目录缓存（可能为空，不联网） |
| `catalog:refresh` | invoke | 联网刷新 models.dev 目录；失败时返回旧快照 + `lastError` |
| `chat:start` | invoke | 请求体为完整 messages；整段生成结束后 resolve |
| `chat:abort` | send | 按 `requestId` 中止 |
| `chat:event` | main → renderer | `delta` / `done` / `error` |
| `conv:load` / `conv:save` / `conv:clear` | invoke | 按文档路径读写会话（最多 200 条） |
| `shell:openExternal` | invoke | 仅放行 `http:` / `https:` |
| `app:bootstrap` | invoke | 启动信息（E2E 自动打开文档） |

主进程 handler 的错误统一归一化为 `{ code, message }`，`message` 为可直接展示的中文文案。

## 3. 上下文预算算法（`src/shared/chat/context.ts`）

1. `budget = max(settings.maxContextChars, 800)`，默认 24000 字符。
2. 选区：始终附带，最多 8000 字符，超出标记「已截断」。
3. 若 `markdown.length + outline.length <= budget` → **注入全文**。
4. 否则若已知当前小节（滚动同步得到的 `github-slugger` id）→ 注入
   **全文目录 + 当前小节 ± 相邻各两节**，按「当前 → 前一节 → 后一节 → 前二 → 后二」顺序填空，超出预算的跳过。
5. 否则（未定位）→ 注入文档开头 `budget - outline.length` 字符。
6. 提示词固定为：system → 上下文（user）→ 最近 20 条历史 → 本轮问题。
   带 `error` 的空/半截回复不进历史。

这样既满足「全文问答」的直觉，又避免长文档撑爆上下文窗口。

## 4. 为什么禁用 raw HTML

`remark-rehype` 未开启 `allowDangerousHtml`，md 里的 `<script>`、`<img onerror>` 会被直接丢弃；
渲染结果再由 `dangerouslySetInnerHTML` 挂载，因此不存在 md 内联 HTML 的执行面。
外链点击一律 `preventDefault` 后经主进程 `shell.openExternal` 打开，且只允许 http/https；
`#` 锚点在阅读器内部滚动，不触发外链。

## 5. API Key 的保存路径

```
renderer 输入 Key
  → settings:save(Partial<SettingsInput>)
  → SettingsStore.save（渲染端永远不读回明文）
  → safeStorage.encryptString(key) → base64
  → settings.json {
      version: 2,
      settings: { baseUrl, model, temperature, maxContextChars, theme },
      apiKeys: { "<规范化 baseUrl>": "enc:<base64>" }
    }
使用：
  → chat:start → SettingsStore.load() 按当前 baseUrl 解密对应 Key → streamChat(...)
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
  实际生效的始终是 settings.json 里的 `baseUrl` / `model`，不新增服务商持久化字段。
- 本地服务商（`localhost` / `127.0.0.1` / `[::1]`）允许空 Key，便于 Ollama / LM Studio；
  远程地址仍然强制要求 Key（主进程 `chat:start` 抛 `LLM_NO_KEY`，渲染层发送前也会拦截）。

## 6. 供应商预设（`src/shared/providerPresets.ts`）

- 静态快照 60+ 个主流 OpenAI 兼容服务商（含 12 个 coding plan endpoint），
  `id` / `name` / `baseUrl` / `docUrl` / `models` 与 models.dev 对齐；
  `keywords` / `keyUrl` / `modelsUrl` / `defaultModel` / `local` / `aliases` 是 Remda 的 UI
  与兼容扩展。
- 只收录能用 Bearer + `/chat/completions` 访问的供应商；Azure、Bedrock、Vertex、原生
  Anthropic/Google SDK、Cohere、GitHub Copilot 以及带 `${...}` 模板地址的供应商暂不内置。
- `baseUrl` 尽量保持稳定；`aliases` 用于兼容旧地址（例如 DeepSeek 带不带 `/v1`）以及未来
  models.dev 的 `api` 形式，避免升级后已保存配置被识别成「其他（自定义）」。
- `models` 里带 `{ id, name, deprecated? }`，与联网目录同构；离线时用这份列表，联网后由 models.dev 覆盖。
- 有活跃模型时过滤 deprecated；如果供应商全部模型都 deprecated，保留并标记「已弃用」。
- 混合协议供应商（OpenCode / Go、coding plan）使用各自的模型列表地址；
  当前客户端只保留其中 `@ai-sdk/openai-compatible` 的模型，原生 Anthropic/Google/Responses
  模型等 0.4.0 多协议适配后再开放。
- `modelsUrl` 用于模型列表地址与 Base URL 不同的网关（OpenCode / Go），也用于公开 `/models`
  交叉校验和「测试连接」。
- 以后要做动态供应商列表，只需把 `PROVIDER_PRESETS` 换成「静态兜底 + 联网目录覆盖」，
  `ProviderPicker` / `SettingsDialog` 的数据结构不用变。

## 7. 模型目录（models.dev）

- 启动时主进程的 `ModelCatalog` 先读 `userData/model-catalog.json`，再后台请求
  `https://models.dev/api.json`；本地列表立即可用，不阻塞窗口。
- 缓存带 `version`（当前 v4）和 `providerIds` 签名。升级后或供应商列表变化时签名不一致，
  会丢掉 ETag 和旧缓存，强制拉一次完整数据并覆盖缓存，避免 304 让新供应商一直拿不到模型。
- 请求带上次的 `ETag`，未变化时返回 304；超时 15s，断网/解析失败时保留旧缓存。
  首次运行且离线时，使用 `src/shared/providerPresets.ts` 里的内置模型列表。
- 解析时读取模型级 `provider.npm/api`：非手工兼容供应商只保留 `@ai-sdk/openai-compatible`
  且 API 地址一致的模型；OpenAI/Google/Anthropic/Groq/Mistral/xAI/Together/Perplexity/
  DeepInfra/Cerebras/OpenRouter/LM Studio 使用手工白名单。
- 有活跃模型时过滤 `status === "deprecated"`；全部 deprecated 的供应商保留模型并打标签。
- 对带 `modelsUrl` 的公开供应商拉取 `/models` 做交叉校验：混合协议供应商只取交集，
  普通供应商以接口列表为准，大列表限制在 300 项，失败时回退 models.dev。
- 只保留 Remda 映射的供应商（`PROVIDERS` 中的 id，`ollama` 除外）与 `output` 含 `text` 的对话模型，
  过滤 embedding / image / audio / tts / rerank 等，按发布时间倒序。
- 渲染进程只通过 `catalog:get` / `catalog:refresh` 读取缓存，不直接联网；请求不携带 API Key。
- 目录只能降低「模型 ID 写错」的概率，不保证账号已开通；设置里始终保留「自定义模型…」入口，
  已保存但目录中没有的模型也会显示为「已保存」。
- E2E（存在 `REMDA_E2E_SETTINGS`）跳过启动刷新，保证测试离线可跑。
- `openaiClient` 对所有请求发送 `User-Agent: Remda`；对 `opencode.ai` 地址额外发送
  `x-opencode-session`（当前使用请求 ID），满足 OpenCode / Go 的客户端标识要求。
- 主进程使用 `app.requestSingleInstanceLock()`：第二个实例直接退出并聚焦已有窗口，
  避免多个进程同时读写 userData/Chromium 缓存。

## 8. 测试分层

| 层 | 位置 | 环境 |
|---|---|---|
| 纯逻辑 | `src/shared/**/*.test.ts`、`src/main/**/*.test.ts` | node（文件顶部声明 `@vitest-environment node`） |
| 组件 / store | `src/renderer/**/*.test.tsx` | jsdom + Testing Library（`mockRemda()` 假 `window.remda`） |
| 端到端 | `e2e/smoke.spec.ts` | Playwright `_electron` + 本地 SSE mock LLM |

主进程服务全部写成不依赖 Electron 的纯 TS 模块（密钥盒、对话框、`shell` 均通过依赖注入），
因此可以直接用 Vitest 测试，不需要启动 Electron。
