import { contextBridge, ipcRenderer } from 'electron'
import { createApi } from './api'

contextBridge.exposeInMainWorld(
  'remda',
  createApi({
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
  })
)
