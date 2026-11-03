import type { MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/ipc'

export interface MenuDeps {
  platform: NodeJS.Platform
  /** 开发版才展示开发者工具与强制刷新 */
  isDev: boolean
  sendAction(action: MenuAction): void
  showAbout(): void
  openHomepage(): void
}

/** 生成应用菜单模板；不依赖 Electron 运行时，方便单测。 */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const isMac = deps.platform === 'darwin'

  const fileMenu: MenuItemConstructorOptions = {
    label: '文件',
    submenu: [
      {
        label: '打开文件夹…',
        accelerator: 'CmdOrCtrl+O',
        click: () => deps.sendAction('open-folder')
      },
      {
        label: '打开文件…',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => deps.sendAction('open-file')
      },
      { type: 'separator' },
      { label: '关闭当前文件夹', click: () => deps.sendAction('close-folder') },
      { type: 'separator' },
      {
        label: '设置…',
        accelerator: 'CmdOrCtrl+,',
        click: () => deps.sendAction('settings')
      },
      { type: 'separator' },
      { role: 'quit', label: '退出' }
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' }
    ]
  }

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'reload', label: '重新加载' },
    ...(deps.isDev
      ? ([
          { role: 'forceReload', label: '强制重新加载' },
          { role: 'toggleDevTools', label: '开发者工具' }
        ] as MenuItemConstructorOptions[])
      : []),
    { type: 'separator' },
    { role: 'resetZoom', label: '实际大小' },
    { role: 'zoomIn', label: '放大' },
    { role: 'zoomOut', label: '缩小' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: '全屏' },
    { type: 'separator' },
    {
      label: '显示/隐藏文件树',
      accelerator: 'CmdOrCtrl+B',
      click: () => deps.sendAction('toggle-tree')
    },
    {
      label: '显示/隐藏 AI 面板',
      accelerator: 'CmdOrCtrl+J',
      click: () => deps.sendAction('toggle-chat')
    }
  ]

  const viewMenu: MenuItemConstructorOptions = {
    label: '视图',
    submenu: viewSubmenu
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: '帮助',
    submenu: [
      ...(isMac ? [] : [{ label: '关于 Remda', click: () => deps.showAbout() }]),
      { label: '项目主页', click: () => deps.openHomepage() }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'close', label: '关闭' }
    ]
  }

  return [
    ...(isMac ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[]) : []),
    fileMenu,
    editMenu,
    viewMenu,
    ...(isMac ? [windowMenu] : []),
    helpMenu
  ]
}
