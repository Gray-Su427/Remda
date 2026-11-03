export interface CollapsiblePanel {
  isCollapsed(): boolean
  collapse(): void
  expand(): void
}

/** 折叠/展开一个可折叠面板；ref 尚未挂载时不做任何事。 */
export function togglePanel(panel: CollapsiblePanel | null): void {
  if (!panel) return
  if (panel.isCollapsed()) panel.expand()
  else panel.collapse()
}
