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

## 技术栈

Electron + electron-vite + React 19 + TypeScript + Zustand + unified(remark/rehype) + KaTeX + Vitest + Playwright。

## 目录

- `src/shared` 主/渲染共用（类型、IPC 契约、Markdown 与上下文纯逻辑）
- `src/main` Electron 主进程（文件、设置、密钥、会话、LLM 流式代理）
- `src/preload` 类型化 `window.remda` 桥（只做转发）
- `src/renderer` React UI

## 更新记录

- v0.1.0 (2026-10-24) — 首个版本：Markdown 阅读 + 基于当前文档/小节/选区的流式问答。
