export interface FullscreenInput {
  type: string
  key: string
  code?: string
}

export interface FullscreenTarget {
  isFullScreen(): boolean
  setFullScreen(fullscreen: boolean): void
  webContents: {
    on(
      event: 'before-input-event',
      listener: (event: { preventDefault(): void }, input: FullscreenInput) => void
    ): void
  }
}

/** 原生全屏下按 Esc 退出全屏；非全屏时保持 Esc 的原有行为。 */
export function exitFullscreenOnEscape(target: FullscreenTarget): void {
  target.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key !== 'Escape' && input.code !== 'Escape') return
    if (!target.isFullScreen()) return
    event.preventDefault()
    target.setFullScreen(false)
  })
}
