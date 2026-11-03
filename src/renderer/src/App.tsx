import { useEffect } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { ChatPane } from './components/ChatPane'
import { FileTree } from './components/FileTree'
import { ReaderPane } from './components/ReaderPane'
import { SelectionToolbar } from './components/SelectionToolbar'
import { SettingsDialog } from './components/SettingsDialog'
import { togglePanel } from './layout/panelToggle'
import { useSettingsStore } from './stores/settingsStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import './styles/layout.css'

export function App() {
  const treePanel = usePanelRef()
  const chatPanel = usePanelRef()

  useEffect(() => {
    void useSettingsStore.getState().load()
    void window.remda.app.getBootstrap().then(async (info) => {
      if (info.e2eDoc) {
        await useWorkspaceStore.getState().openFile(info.e2eDoc)
        return
      }
      await useWorkspaceStore.getState().restoreLastWorkspace()
    })
  }, [])

  useEffect(() => {
    return window.remda.app.onMenuAction((action) => {
      const workspace = useWorkspaceStore.getState()
      switch (action) {
        case 'open-folder':
          void workspace.openFolder()
          break
        case 'open-file':
          void workspace.openFileDialog()
          break
        case 'close-folder':
          workspace.closeFolder()
          break
        case 'settings':
          useSettingsStore.getState().setOpen(true)
          break
        case 'toggle-tree':
          togglePanel(treePanel.current)
          break
        case 'toggle-chat':
          togglePanel(chatPanel.current)
          break
      }
    })
  }, [treePanel, chatPanel])

  return (
    <div className="app">
      <header className="app__title">
        <span>Remda</span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => useSettingsStore.getState().setOpen(true)}
        >
          设置
        </button>
      </header>
      <Group orientation="horizontal" className="app__body">
        <Panel
          id="tree"
          defaultSize="18"
          minSize="12"
          maxSize="32"
          collapsible
          collapsedSize="0%"
          panelRef={treePanel}
          className="pane pane--tree"
        >
          <FileTree />
        </Panel>
        <Separator className="resize-handle" />
        <Panel id="reader" defaultSize="52" minSize="30" className="pane pane--reader">
          <ReaderPane />
        </Panel>
        <Separator className="resize-handle" />
        <Panel
          id="chat"
          defaultSize="30"
          minSize="22"
          collapsible
          collapsedSize="0%"
          panelRef={chatPanel}
          className="pane pane--chat"
        >
          <ChatPane />
        </Panel>
      </Group>
      <SelectionToolbar />
      <SettingsDialog />
    </div>
  )
}
