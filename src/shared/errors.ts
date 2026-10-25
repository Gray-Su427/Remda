export interface AppErrorShape {
  code: string
  message: string
}

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function toAppError(error: unknown): AppErrorShape {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message }
  return { code: 'UNKNOWN', message: String(error) }
}

/** Electron 会把 ipcMain.handle 的拒绝包装成 "Error invoking remote method 'x': ..." */
const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*':\s*/
const ERROR_PREFIX = /^Error:\s*/

/**
 * 把任意异常转换成可直接展示的中文文案：
 * 去掉 Electron 的 IPC 包装前缀，兼容 { code, message } 形式的裸对象。
 */
export function readErrorMessage(error: unknown): string {
  let raw: string
  if (error instanceof Error) raw = error.message
  else if (typeof error === 'string') raw = error
  else if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    raw = (error as { message: string }).message
  } else raw = String(error)

  return raw.replace(IPC_ERROR_PREFIX, '').replace(ERROR_PREFIX, '')
}
