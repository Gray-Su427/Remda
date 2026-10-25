import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ChatPane } from './components/ChatPane'
import { FileTree } from './components/FileTree'
import { ReaderPane } from './components/ReaderPane'
import { SelectionToolbar } from './components/SelectionToolbar'
import { SettingsDialog } from './components/SettingsDialog'
import { useSettingsStore } from './stores/settingsStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import './styles/layout.css'

export function App() {
  useEffect(() => {
    void useSettingsStore.getState().load()
    void window.remda.app.getBootstrap().then((info) => {
      if (info.e2eDoc) void useWorkspaceStore.getState().openFile(info.e2eDoc)
    })
  }, [])

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
        <Panel id="tree" defaultSize="18" minSize="12" maxSize="32" className="pane pane--tree">
          <FileTree />
        </Panel>
        <Separator className="resize-handle" />
        <Panel id="reader" defaultSize="52" minSize="30" className="pane pane--reader">
          <ReaderPane />
        </Panel>
        <Separator className="resize-handle" />
        <Panel id="chat" defaultSize="30" minSize="22" className="pane pane--chat">
          <ChatPane />
        </Panel>
      </Group>
      <SelectionToolbar />
      <SettingsDialog />
    </div>
  )
}
