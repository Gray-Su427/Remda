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

1. 右上角「设置」→ 搜索并选择服务商（内置 DeepSeek、OpenAI、硅基流动、Ollama 等，自动填好 Base URL 和默认模型）→ 填 API Key。
2. 点「测试连接」，看到「连接成功」后保存。
3. 打开一个 md 文件夹，点文件开始阅读；右侧提问，或选中正文后点「问 AI」。

> API Key 使用系统凭据加密后存于 `%APPDATA%/Remda/settings.json`，渲染进程只能看到掩码。
> 若系统不支持 `safeStorage`，会退回以 `plain:` 前缀明文保存（仍仅主进程可读），此时请自行评估风险。

## 功能

- 文件树（md/markdown/mdx）+ 单文件打开，记住最近打开的文档
- 内置 16 个 OpenAI 兼容服务商，可搜索选择并自动填好 Base URL 与默认模型；也支持手动填写自定义地址
- GFM 表格 / 任务列表 / 删除线、KaTeX 公式、代码高亮、标题锚点
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

- v0.2.0 (2026-10-25) — 设置内置 16 个 OpenAI 兼容服务商，可搜索选择并自动填好 Base URL 与默认模型；选定预设后隐藏 Base URL 输入，仅「其他（自定义）」可手动填写；本地 Ollama / LM Studio 支持免 Key。
- v0.1.1 (2026-10-25) — 修复 IPC 报错只显示 `[object Object]` 的问题：文件不存在、非 Markdown、超过 5MB 等情况现在直接显示中文原因。
- v0.1.0 (2026-10-25) — 首个版本：Markdown 阅读（单换行保留、YAML frontmatter 剥离）+ 基于当前文档/小节/选区的流式问答。
