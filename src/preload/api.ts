import type { RemdaApi } from '@shared/api'
import { IPC, type ChatEvent, type ChatRequest } from '@shared/ipc'
import type {
  BootstrapInfo,
  ChatMessage,
  ConnectionCheck,
  DocumentPayload,
  FileChangeEvent,
  FileNode,
  PublicSettings,
  SettingsInput
} from '@shared/types'

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void
}

export function createApi(ipc: IpcRendererLike): RemdaApi {
  return {
    fs: {
      pickFolder: () => ipc.invoke(IPC.fsPickFolder) as Promise<string | null>,
      pickFile: () => ipc.invoke(IPC.fsPickFile) as Promise<string | null>,
      readTree: (root: string) => ipc.invoke(IPC.fsReadTree, root) as Promise<FileNode>,
      readDocument: (path: string) =>
        ipc.invoke(IPC.fsReadDocument, path) as Promise<DocumentPayload>,
      watch: async (path: string) => {
        await ipc.invoke(IPC.fsWatch, path)
      },
      unwatch: async (path: string) => {
        await ipc.invoke(IPC.fsUnwatch, path)
      },
      onChanged: (cb: (event: FileChangeEvent) => void) => {
        const listener = (_e: unknown, payload: unknown): void => cb(payload as FileChangeEvent)
        ipc.on(IPC.fsChanged, listener)
        return () => ipc.removeListener(IPC.fsChanged, listener)
      }
    },
    settings: {
      get: () => ipc.invoke(IPC.settingsGet) as Promise<PublicSettings>,
      save: (patch: Partial<SettingsInput>) =>
        ipc.invoke(IPC.settingsSave, patch) as Promise<PublicSettings>,
      test: (input: { baseUrl: string; apiKey?: string; model: string }) =>
        ipc.invoke(IPC.settingsTest, input) as Promise<ConnectionCheck>
    },
    chat: {
      start: async (request: ChatRequest) => {
        await ipc.invoke(IPC.chatStart, request)
      },
      abort: async (requestId: string) => {
        ipc.send(IPC.chatAbort, requestId)
      },
      onEvent: (cb: (event: ChatEvent) => void) => {
        const listener = (_e: unknown, payload: unknown): void => cb(payload as ChatEvent)
        ipc.on(IPC.chatEvent, listener)
        return () => ipc.removeListener(IPC.chatEvent, listener)
      }
    },
    conversations: {
      load: (docPath: string) => ipc.invoke(IPC.convLoad, docPath) as Promise<ChatMessage[]>,
      save: async (docPath: string, messages: ChatMessage[]) => {
        await ipc.invoke(IPC.convSave, docPath, messages)
      },
      clear: async (docPath: string) => {
        await ipc.invoke(IPC.convClear, docPath)
      }
    },
    shell: {
      openExternal: async (url: string) => {
        await ipc.invoke(IPC.shellOpenExternal, url)
      }
    },
    app: {
      getBootstrap: () => ipc.invoke(IPC.appBootstrap) as Promise<BootstrapInfo>
    }
  }
}
