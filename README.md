# Remda

Read md with AI —— 左侧渲染 Markdown，右侧 AI 陪读。

## 开发

```powershell
npm install
npm run dev        # 开发窗口
npm test           # 单元/组件测试
npm run typecheck  # 类型检查
npm run e2e        # 端到端冒烟（需先 npm run build）
npm run dist       # 打 Windows 安装包（release/）
```

> 国内网络下 `npm run dist` 可能因 electron-builder 从 GitHub 下载 NSIS 工具包超时，
> 可先设置 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。

## 首次使用

1. 右上角「设置」→ 搜索并选择服务商（内置 60+ 个主流服务商，含 12 个 coding plan endpoint）→ 从模型列表选择或自定义模型 → 填 API Key。
2. 点「测试连接」，看到「连接成功」后保存。
3. 打开一个 md 文件夹，点文件开始阅读；右侧提问，或选中正文后点「问 AI」。

> 模型列表在启动时从 [models.dev](https://models.dev) 在后台更新，本机缓存后离线可用；
> 网络不可用时自动回退到内置列表。请求只下载模型目录，不发送 API Key 或使用数据。
>
> 模型目录会过滤 models.dev 标记为 `deprecated` 的模型；如果某个供应商全部模型都已弃用，
> 会保留并显示「已弃用」标签。公开 `/models` 的供应商还会额外做一次可用性校验。
>
> 供应商预设是 models.dev 的静态快照，60+ 个主流服务商，含 OpenCode Go、
> Kimi For Coding、智谱 / Z.AI、阿里、腾讯、火山、小米、阶跃等 coding plan endpoint；
> 除 OpenAI Chat Completions 外，还支持 Anthropic Messages、Gemini 与 OpenAI Responses，
> 网关中声明原生协议的模型（Claude / Gemini / GPT 等）可以直接选择使用。
> Azure、Bedrock、Vertex 等需要额外认证体系的供应商暂未内置，可用「其他（自定义）」手动填写。
>
> 每个服务商的 API Key 按 Base URL 分别保存，切换服务商时会自动切换对应的 Key；
> Key 使用系统凭据加密后存于 `%APPDATA%/Remda/settings.json`，渲染进程只能看到掩码。
> 若系统不支持 `safeStorage`，会退回以 `plain:` 前缀明文保存（仍仅主进程可读），此时请自行评估风险。

## 功能

- 文件树（md/markdown/mdx）+ 单文件打开，记住最近打开的文档
- 内置 60+ 个主流服务商，含 12 个 coding plan endpoint，ID/名称/模型结构与 models.dev 对齐，可搜索选择并自动填好 Base URL；其余供应商可用「其他（自定义）」手动填写
- 支持四种协议：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini；OpenCode / Go 等混合协议网关的原生 Claude / Gemini / GPT 模型可直接调用，设置页会标注模型协议
- 模型目录按 models.dev 的 `status` 过滤弃用模型、按模型级协议过滤不可调用模型，并对公开 `/models` 的供应商做交叉校验
- 每个服务商的 API Key 单独保存，切换服务商时自动切换；未填过 Key 的服务商不会占用存储
- 模型目录启动时后台更新（models.dev），带本地缓存、ETag 增量检查和内置列表兜底；支持手动刷新
- 选定预设后隐藏 Base URL 输入，仅「其他（自定义）」可手动填写；模型落在列表外时可自定义模型 ID
- GFM 表格 / 任务列表 / 删除线、KaTeX 公式、代码高亮、标题锚点
- Markdown 图片：https 直连、http 通过主进程代理加载、本地相对路径按文档目录解析；本地图片限制在已打开的文件夹或文档目录一级范围内，加载失败会显示占位与「在浏览器打开」
- 流式问答，可停止、重试、清空；回答同样支持 Markdown + 公式
- 上下文默认注入全文，超预算自动降级为「目录 + 当前小节 ± 相邻小节」
- 选中正文浮出「问 AI」，以引用形式带入提问
- 每个文档的对话按路径持久化，重开文档自动恢复

## 技术栈

Electron + electron-vite + React 19 + TypeScript(strict) + Zustand +
react-resizable-panels + unified(remark/rehype) + KaTeX + highlight.js + chokidar +
Vitest + Testing Library + Playwright(_electron) + electron-builder。

架构与 IPC 契约见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 更新记录

- v0.4.1 (2026-10-27) — 图片渲染修复：http 图片通过主进程 `remda-img` 协议代理加载，绕开 CSP 与 file:// 混合内容限制；Markdown 相对路径图片按当前文档目录解析，本地图片限制在已打开的文件夹或文档目录一级范围内，并做扩展名、大小与符号链接校验；图片加载失败显示占位与「在浏览器打开」，不再静默空白；CSP 增加 `remda-img:`，原始 HTML `<img>` 仍按安全规则不渲染。
- v0.4.0 (2026-10-27) — 多协议适配：新增 OpenAI Responses、Anthropic Messages、Gemini 原生协议；OpenCode / Go 等混合协议网关的 Claude / Gemini / GPT 模型不再被过滤，可直接选择；模型目录缓存升级到 v5，按 models.dev 模型级 `npm` / `api` 解析协议与 endpoint；设置页显示模型协议并随配置持久化，测试连接按协议使用对应鉴权；修复 Anthropic 预设此前无法调用的问题。
- v0.3.4 (2026-10-27) — 模型目录改为全局信任 models.dev 的 `status` 与模型级协议：过滤 deprecated 模型（全部 deprecated 的供应商保留并标注）、不再显示 Anthropic/Google/Responses 等当前客户端无法调用的模型；对 OpenCode/Go、OpenRouter、ModelScope、OVHcloud、SambaNova、DeepInfra、NVIDIA、Chutes 等公开 `/models` 的供应商做交叉校验，修复 Go 的 `space-bunny` 这类已下架模型导致的 400。
- v0.3.3 (2026-10-27) — 新增 12 个主流 coding plan endpoint（OpenCode Go、Kimi For Coding、智谱 / Z.AI、阿里、腾讯、火山、小米、阶跃）；OpenCode / Go 使用独立的模型列表地址，并发送 `User-Agent: Remda` 与 `x-opencode-session`；coding plan 供应商只显示 OpenAI 兼容模型，避免选中原生协议模型后失败。
- v0.3.2 (2026-10-27) — 供应商预设从 16 个扩展到 50 个主流 OpenAI 兼容服务商，现有条目的 id/名称/Base URL/模型结构对齐 models.dev，为后续动态供应商目录做准备；新增供应商的模型也接入 models.dev 动态更新；没有 Key 页面时显示「查看文档」；修复旧模型目录缓存因 ETag 304 导致新供应商不更新的问题；增加单实例锁，减少 Chromium 缓存目录冲突。
- v0.3.1 (2026-10-25) — API Key 改为按服务商（Base URL）分别保存，切换服务商时自动切换对应 Key；只保存输入过 Key 的地址，旧版本单一 Key 会自动迁移到当前服务商；本地 Ollama / LM Studio 无 Key 不再被前端误拦截。
- v0.3.0 (2026-10-25) — 模型选择改为联网目录：启动时从 models.dev 后台更新模型列表（本地缓存 + ETag + 内置列表兜底），设置里可搜索选择模型、查看更新时间并手动刷新；预设之外的新模型可通过「自定义模型…」填写，已保存的未知模型不会丢失。
- v0.2.0 (2026-10-25) — 设置内置 16 个 OpenAI 兼容服务商，可搜索选择并自动填好 Base URL 与默认模型；选定预设后隐藏 Base URL 输入，仅「其他（自定义）」可手动填写；本地 Ollama / LM Studio 支持免 Key。
- v0.1.1 (2026-10-25) — 修复 IPC 报错只显示 `[object Object]` 的问题：文件不存在、非 Markdown、超过 5MB 等情况现在直接显示中文原因。
- v0.1.0 (2026-10-25) — 首个版本：Markdown 阅读（单换行保留、YAML frontmatter 剥离）+ 基于当前文档/小节/选区的流式问答。
