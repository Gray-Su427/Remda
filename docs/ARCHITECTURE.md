# Remda 架构

Remda（read md with ai）是 Electron 桌面应用：左侧渲染本地 Markdown，右侧调用 OpenAI 兼容模型陪读。
本文说明进程职责、IPC 契约、上下文裁剪算法与安全边界。

## 1. 进程职责

```
renderer (React + Zustand)
  ├─ FileTree      ← window.remda.fs.readTree
  ├─ ReaderPane    ← window.remda.fs.readDocument + 本地 Markdown 渲染
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
  ├─ ConversationStore    userData/conversations/<sha1(docPath)>.json
  ├─ llm/openaiClient     fetch + SSE 手工解析（支持 AbortSignal）
  └─ ipc/register         全部 handler 装配，可注入 ipcMain 便于单测
```

**主进程负责**：文件系统、设置与密钥、会话持久化、LLM 网络请求、外链打开。
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
| `settings:get` | invoke | 返回 `PublicSettings`（仅 `hasApiKey`/`apiKeyHint`） |
| `settings:save` | invoke | 合并补丁；Key 省略表示保持不变 |
| `settings:test` | invoke | `GET {baseUrl}/models` 探活 |
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
  → settings.json { version: 1, settings: {...}, apiKeyEnc: "enc:<base64>" }
使用：
  → chat:start → SettingsStore.load() 在主进程解密 → streamChat(...)
```

- `safeStorage.isEncryptionAvailable()` 为 false 时回退 `plain:` 前缀（README 有说明），
  仍然只有主进程读取该文件，渲染进程拿到的只有 `apiKeyHint`（`sk-••••1234`）。
- Key 只在主进程内存在；不写入日志、不进 IPC 响应、不进渲染进程内存。

## 6. 测试分层

| 层 | 位置 | 环境 |
|---|---|---|
| 纯逻辑 | `src/shared/**/*.test.ts`、`src/main/**/*.test.ts` | node（文件顶部声明 `@vitest-environment node`） |
| 组件 / store | `src/renderer/**/*.test.tsx` | jsdom + Testing Library（`mockRemda()` 假 `window.remda`） |
| 端到端 | `e2e/smoke.spec.ts` | Playwright `_electron` + 本地 SSE mock LLM |

主进程服务全部写成不依赖 Electron 的纯 TS 模块（密钥盒、对话框、`shell` 均通过依赖注入），
因此可以直接用 Vitest 测试，不需要启动 Electron。
