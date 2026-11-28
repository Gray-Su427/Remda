import type { ChatMessage, WorkspaceSource } from './types'

export const IPC = {
  fsPickFolder: 'fs:pickFolder',
  fsPickFile: 'fs:pickFile',
  fsReadTree: 'fs:readTree',
  fsReadDocument: 'fs:readDocument',
  fsWatch: 'fs:watch',
  fsUnwatch: 'fs:unwatch',
  fsChanged: 'fs:changed',
  workspaceRetrieve: 'workspace:retrieve',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsTest: 'settings:test',
  catalogGet: 'catalog:get',
  catalogRefresh: 'catalog:refresh',
  chatStart: 'chat:start',
  chatAbort: 'chat:abort',
  chatEvent: 'chat:event',
  convLoad: 'conv:load',
  convSave: 'conv:save',
  convClear: 'conv:clear',
  shellOpenExternal: 'shell:openExternal',
  appBootstrap: 'app:bootstrap',
  menuAction: 'menu:action'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** 主进程菜单触发的渲染进程动作 */
export type MenuAction =
  | 'open-folder'
  | 'open-file'
  | 'close-folder'
  | 'settings'
  | 'toggle-tree'
  | 'toggle-chat'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatWorkspaceRequest {
  root: string
  docPath?: string
  question: string
  selection?: string
  /** 工作区片段可用的字符预算 */
  budget: number
}

export interface ChatRequest {
  requestId: string
  messages: LlmMessage[]
  /** AI 检索模式：由主进程先规划相关文件，再补充上下文 */
  workspace?: ChatWorkspaceRequest
}

export type ChatPhase = 'planning' | 'reading' | 'answering'

export type ChatEvent =
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'phase'; requestId: string; phase: ChatPhase }
  | { type: 'sources'; requestId: string; sources: WorkspaceSource[] }
  | { type: 'notice'; requestId: string; message: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; message: string }

export type SavedMessage = ChatMessage
