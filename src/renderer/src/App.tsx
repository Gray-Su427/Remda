import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { FileTree } from './components/FileTree'
import { useSettingsStore } from './stores/settingsStore'
import './styles/layout.css'

export function App() {
  useEffect(() => {
    void useSettingsStore.getState().load()
  }, [])

  return (
    <div className="app">
      <header className="app__title">Remda</header>
      <Group orientation="horizontal" className="app__body">
        <Panel id="tree" defaultSize="18" minSize="12" maxSize="32" className="pane pane--tree">
          <FileTree />
        </Panel>
        <Separator className="resize-handle" />
        <Panel id="reader" defaultSize="52" minSize="30" className="pane pane--reader">
          <div className="placeholder">左侧渲染区</div>
        </Panel>
        <Separator className="resize-handle" />
        <Panel id="chat" defaultSize="30" minSize="22" className="pane pane--chat">
          <div className="placeholder">右侧 AI 区</div>
        </Panel>
      </Group>
    </div>
  )
}
