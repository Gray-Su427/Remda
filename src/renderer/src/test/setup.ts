import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom 未实现 ResizeObserver，react-resizable-panels 在挂载时需要它。
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true,
    writable: true
  })
}

// jsdom 未实现滚动 API，聊天自动滚底与锚点跳转需要它们。
if (typeof Element !== 'undefined') {
  Element.prototype.scrollTo = function scrollTo(): void {}
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}

afterEach(() => cleanup())
