import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { ConversationStore } from './services/conversationStore'
import { SettingsStore, type SecretBox } from './services/settingsStore'
import { createHandlers, registerIpc, type IpcMainLike } from './ipc/register'

let mainWindow: BrowserWindow | null = null

function createSecretBox(): SecretBox | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Remda',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const userData = app.getPath('userData')
  const settings = new SettingsStore(join(userData, 'settings.json'), createSecretBox())
  const conversations = new ConversationStore(join(userData, 'conversations'))

  const handlers = createHandlers({
    pickFolder: async () => {
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    pickFile: async () => {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    settings,
    conversations,
    emitChat: (event) => win.webContents.send(IPC.chatEvent, event),
    emitFile: (event) => win.webContents.send(IPC.fsChanged, event),
    openExternal: (url) => shell.openExternal(url),
    bootstrap: async () => ({ e2eDoc: process.env.REMDA_E2E_DOC })
  })

  registerIpc(ipcMain as unknown as IpcMainLike, handlers)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  mainWindow = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
