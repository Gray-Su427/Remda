import { useState } from 'react'
import type { FileNode } from '@shared/types'
import { useWorkspaceStore } from '../stores/workspaceStore'

function Node({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const currentPath = useWorkspaceStore((s) => s.currentDoc?.path)
  const indent = { paddingLeft: `${depth * 14 + 10}px` }

  if (node.kind === 'dir') {
    return (
      <div>
        <button
          type="button"
          className="tree__row tree__row--dir"
          style={indent}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tree__caret">{open ? '▾' : '▸'}</span>
          {node.name}
        </button>
        {open &&
          node.children.map((child) => <Node key={child.path} node={child} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`tree__row tree__row--file${currentPath === node.path ? ' is-active' : ''}`}
      style={indent}
      title={node.path}
      onClick={() => void openFile(node.path)}
    >
      {node.name}
    </button>
  )
}

export function FileTree() {
  const tree = useWorkspaceStore((s) => s.tree)
  const root = useWorkspaceStore((s) => s.root)
  const openFolder = useWorkspaceStore((s) => s.openFolder)

  if (!tree || tree.kind !== 'dir') {
    return (
      <div className="tree tree--empty">
        <p>还没有打开文件夹</p>
        <button type="button" className="btn" onClick={() => void openFolder()}>
          打开文件夹
        </button>
      </div>
    )
  }

  return (
    <div className="tree">
      <div className="tree__header" title={root ?? ''}>
        {tree.name}
        <button type="button" className="btn btn--ghost" onClick={() => void openFolder()}>
          切换
        </button>
      </div>
      <div className="tree__body">
        {tree.children.map((child) => (
          <Node key={child.path} node={child} depth={0} />
        ))}
      </div>
    </div>
  )
}
