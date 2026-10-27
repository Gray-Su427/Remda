import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { ConversationStore } from './services/conversationStore'
import { ModelCatalog } from './services/modelCatalog'
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

async function applyE2EOverrides(): Promise<string> {
  const userData = app.getPath('userData')
  const settingsPath = process.env.REMDA_E2E_SETTINGS ?? join(userData, 'settings.json')
  const baseUrl = process.env.REMDA_E2E_BASE_URL
  if (baseUrl) {
    const store = new SettingsStore(settingsPath, null)
    await store.save({ baseUrl, model: 'mock', apiKey: 'sk-e2e' })
  }
  return settingsPath
}

async function createWindow(catalog: ModelCatalog): Promise<BrowserWindow> {
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

  const settingsPath = await applyE2EOverrides()
  const settings = new SettingsStore(settingsPath, createSecretBox())
  const conversations = new ConversationStore(join(app.getPath('userData'), 'conversations'))

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
    catalog,
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

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    const catalog = new ModelCatalog(
      join(app.getPath('userData'), 'model-catalog.json'),
      (input, init) => net.fetch(input instanceof URL ? input.href : input, init),
      Date.now,
      15000,
      true
    )
    mainWindow = await createWindow(catalog)
    if (!process.env.REMDA_E2E_SETTINGS) {
      void catalog.refresh()
    }
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = await createWindow(catalog)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
