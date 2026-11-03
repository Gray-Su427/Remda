/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/ipc'
import { buildMenuTemplate, type MenuDeps } from './menu'

function makeDeps(overrides: Partial<MenuDeps> = {}): MenuDeps {
  return {
    platform: 'win32',
    isDev: false,
    sendAction: vi.fn(),
    showAbout: vi.fn(),
    openHomepage: vi.fn(),
    ...overrides
  }
}

function submenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const menu = template.find((item) => item.label === label)
  if (!menu) throw new Error(`missing menu: ${label}`)
  return menu.submenu as MenuItemConstructorOptions[]
}

function findItem(items: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  const item = items.find((entry) => entry.label === label)
  if (!item) throw new Error(`missing item: ${label}`)
  return item
}

function click(item: MenuItemConstructorOptions): void {
  const handler = item.click as unknown as () => void
  handler()
}

describe('buildMenuTemplate', () => {
  it('uses the four-menu layout on windows and keeps edit', () => {
    const template = buildMenuTemplate(makeDeps())
    expect(template.map((item) => item.label)).toEqual(['文件', '编辑', '视图', '帮助'])
    expect(template.some((item) => item.label === '窗口')).toBe(false)
  })

  it('adds the app and window menus on macOS', () => {
    const template = buildMenuTemplate(makeDeps({ platform: 'darwin' }))
    expect(template[0]).toMatchObject({ role: 'appMenu' })
    expect(template.some((item) => item.label === '窗口')).toBe(true)
  })

  it('dispatches file menu actions', () => {
    const deps = makeDeps()
    const items = submenu(buildMenuTemplate(deps), '文件')
    const expected: Array<[string, MenuAction]> = [
      ['打开文件夹…', 'open-folder'],
      ['打开文件…', 'open-file'],
      ['关闭当前文件夹', 'close-folder'],
      ['设置…', 'settings']
    ]
    for (const [index, [label, action]] of expected.entries()) {
      click(findItem(items, label))
      expect(deps.sendAction).toHaveBeenNthCalledWith(index + 1, action)
    }
  })

  it('dispatches panel toggles from the view menu', () => {
    const deps = makeDeps()
    const items = submenu(buildMenuTemplate(deps), '视图')
    click(findItem(items, '显示/隐藏文件树'))
    click(findItem(items, '显示/隐藏 AI 面板'))
    expect(deps.sendAction).toHaveBeenNthCalledWith(1, 'toggle-tree')
    expect(deps.sendAction).toHaveBeenNthCalledWith(2, 'toggle-chat')
  })

  it('shows developer tools only in development builds', () => {
    const labels = (isDev: boolean): Array<string | undefined> =>
      submenu(buildMenuTemplate(makeDeps({ isDev })), '视图').map((item) => item.label)
    expect(labels(false)).not.toContain('开发者工具')
    expect(labels(true)).toContain('开发者工具')
  })

  it('shows about and homepage in the help menu on windows', () => {
    const deps = makeDeps()
    const items = submenu(buildMenuTemplate(deps), '帮助')
    click(findItem(items, '关于 Remda'))
    click(findItem(items, '项目主页'))
    expect(deps.showAbout).toHaveBeenCalledTimes(1)
    expect(deps.openHomepage).toHaveBeenCalledTimes(1)
  })
})
