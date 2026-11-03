import type { ChatMessage } from './types'

export const IPC = {
  fsPickFolder: 'fs:pickFolder',
  fsPickFile: 'fs:pickFile',
  fsReadTree: 'fs:readTree',
  fsReadDocument: 'fs:readDocument',
  fsWatch: 'fs:watch',
  fsUnwatch: 'fs:unwatch',
  fsChanged: 'fs:changed',
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

export interface ChatRequest {
  requestId: string
  messages: LlmMessage[]
}

export type ChatEvent =
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; message: string }

export type SavedMessage = ChatMessage
