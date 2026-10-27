/**
 * 图片加载失败时用可读占位替换 <img>。
 * error 事件不冒泡，必须在容器上以 capture 阶段监听。
 */
export function attachImageFallback(container: HTMLElement): () => void {
  const fail = (image: HTMLImageElement): void => {
    if (image.dataset.failed === '1') return
    image.dataset.failed = '1'

    const placeholder = document.createElement('span')
    placeholder.className = 'image-failed'
    const label = image.alt.trim() || '图片'
    placeholder.append(`${label}加载失败`)

    const original =
      image.dataset.originalSrc ||
      (/^https?:\/\//i.test(image.src) ? image.src : '')
    if (/^https?:\/\//i.test(original)) {
      const link = document.createElement('a')
      link.href = original
      link.textContent = '（在浏览器打开）'
      link.addEventListener('click', (event) => {
        event.preventDefault()
        void window.remda.shell.openExternal(original)
      })
      placeholder.append(link)
    }

    image.replaceWith(placeholder)
  }

  const onError = (event: Event): void => {
    if (event.target instanceof HTMLImageElement) fail(event.target)
  }

  container.addEventListener('error', onError, true)
  return () => container.removeEventListener('error', onError, true)
}
