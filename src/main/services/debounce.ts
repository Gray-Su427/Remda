export function createDebouncer(waitMs: number): (fn: () => void) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (fn) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn()
    }, waitMs)
  }
}
