import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installMockRemda, mockRemda } from '../test/mockRemda'
import { attachImageFallback } from './imageFallback'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
})

const addImage = (attributes: Record<string, string>): HTMLImageElement => {
  const image = document.createElement('img')
  for (const [key, value] of Object.entries(attributes)) image.setAttribute(key, value)
  container.append(image)
  return image
}

describe('attachImageFallback', () => {
  it('replaces a failed network image and opens the original url', () => {
    const api = installMockRemda()
    const detach = attachImageFallback(container)
    const image = addImage({
      src: 'remda-img://remote/?url=https%3A%2F%2Fexample.com%2Fa.png',
      alt: '示意图',
      'data-original-src': 'https://example.com/a.png'
    })

    fireEvent.error(image)

    const placeholder = container.querySelector('.image-failed')
    expect(placeholder?.textContent).toContain('示意图加载失败')
    expect(image.isConnected).toBe(false)

    fireEvent.click(container.querySelector('.image-failed a')!)
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://example.com/a.png')
    detach()
  })

  it('shows a plain placeholder for local images without a browser link', () => {
    installMockRemda(mockRemda())
    const detach = attachImageFallback(container)
    const image = addImage({ src: 'remda-img://local/?path=abc', alt: '本地图' })

    fireEvent.error(image)

    expect(container.querySelector('.image-failed')?.textContent).toBe('本地图加载失败')
    expect(container.querySelector('.image-failed a')).toBeNull()
    detach()
  })

  it('stops handling events after detach', () => {
    installMockRemda(mockRemda())
    const detach = attachImageFallback(container)
    detach()

    const image = addImage({ src: 'https://example.com/a.png', alt: '图' })
    fireEvent.error(image)

    expect(container.querySelector('.image-failed')).toBeNull()
    expect(image.isConnected).toBe(true)
  })
})
