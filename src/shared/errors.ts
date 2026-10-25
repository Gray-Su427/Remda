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
