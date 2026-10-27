import { describe, expect, it } from 'vitest'
import {
  dirname,
  isPathInside,
  normalizeImageSource,
  normalizePath
} from './images'
import { renderMarkdown } from './render'

const localPath = (src: string): string => {
  const hex = new URL(src).searchParams.get('path')
  expect(hex).toBeTruthy()
  return Buffer.from(hex!, 'hex').toString('utf8')
}

describe('path helpers', () => {
  it('resolves dirname for windows and posix paths', () => {
    expect(dirname('D:\\notes\\ch1\\a.md')).toBe('D:/notes/ch1')
    expect(dirname('D:/notes/ch1/a.md')).toBe('D:/notes/ch1')
    expect(dirname('/home/me/a.md')).toBe('/home/me')
    expect(dirname('a.md')).toBe('')
  })

  it('normalizes paths and rejects traversal above the root', () => {
    expect(normalizePath('D:/notes/ch1/../assets/a.png')).toBe('D:/notes/assets/a.png')
    expect(normalizePath('D:/../a.png')).toBeNull()
    expect(normalizePath('/home/me/../a.png')).toBe('/home/a.png')
    expect(normalizePath('/../a.png')).toBeNull()
  })

  it('checks path containment case-insensitively on windows', () => {
    expect(isPathInside('D:/notes', 'D:/notes/ch1/a.md')).toBe(true)
    expect(isPathInside('d:/notes/', 'D:/notes/a.md')).toBe(true)
    expect(isPathInside('D:/notes', 'D:/notes2/a.md')).toBe(false)
    expect(isPathInside('/home/me', '/home/me/a.md')).toBe(true)
    expect(isPathInside('/home/me', '/home/other/a.md')).toBe(false)
  })
})

describe('normalizeImageSource', () => {
  it('keeps https and data images', () => {
    expect(normalizeImageSource('https://example.com/a.png')).toEqual({
      src: 'https://example.com/a.png',
      originalSrc: 'https://example.com/a.png'
    })
    expect(normalizeImageSource('data:image/png;base64,AAAA')).toEqual({
      src: 'data:image/png;base64,AAAA'
    })
  })

  it('proxies http images and keeps the original address', () => {
    expect(normalizeImageSource('http://example.com/a.png')).toEqual({
      src: 'remda-img://remote/?url=http%3A%2F%2Fexample.com%2Fa.png',
      originalSrc: 'http://example.com/a.png'
    })
  })

  it('upgrades protocol-relative addresses to https', () => {
    expect(normalizeImageSource('//cdn.example.com/a.png')).toEqual({
      src: 'https://cdn.example.com/a.png',
      originalSrc: 'https://cdn.example.com/a.png'
    })
  })

  it('rejects unsafe schemes', () => {
    expect(normalizeImageSource('javascript:alert(1)')).toBeNull()
    expect(normalizeImageSource('file:///D:/secret.png')).toBeNull()
    expect(normalizeImageSource('blob:https://example.com/x')).toBeNull()
  })

  it('resolves relative paths against the document directory', () => {
    const options = { baseDir: 'D:/notes/ch1' }
    expect(localPath(normalizeImageSource('./images/a.png', options)!.src)).toBe(
      'D:/notes/ch1/images/a.png'
    )
    expect(localPath(normalizeImageSource('../assets/a.png', options)!.src)).toBe(
      'D:/notes/assets/a.png'
    )
    expect(localPath(normalizeImageSource('images/a.png', options)!.src)).toBe(
      'D:/notes/ch1/images/a.png'
    )
  })

  it('resolves root-relative paths against the workspace root', () => {
    expect(
      localPath(
        normalizeImageSource('/assets/a.png', { baseDir: 'D:/notes/ch1', rootDir: 'D:/notes' })!
          .src
      )
    ).toBe('D:/notes/assets/a.png')
    expect(
      localPath(normalizeImageSource('/assets/a.png', { baseDir: 'D:/notes/ch1' })!.src)
    ).toBe('D:/assets/a.png')
  })

  it('drops paths that escape the drive root', () => {
    expect(normalizeImageSource('../../a.png', { baseDir: 'D:/notes' })).toBeNull()
  })

  it('keeps relative paths when there is no document directory', () => {
    expect(normalizeImageSource('./images/a.png')).toEqual({ src: './images/a.png' })
  })
})

describe('renderMarkdown images', () => {
  it('adds lazy loading and proxies http images', async () => {
    const html = await renderMarkdown('![示意图](http://example.com/a.png)')
    expect(html).toContain('src="remda-img://remote/?url=http%3A%2F%2Fexample.com%2Fa.png"')
    expect(html).toContain('data-original-src="http://example.com/a.png"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).toContain('alt="示意图"')
  })

  it('rewrites relative images into the local image protocol', async () => {
    const html = await renderMarkdown('![图](./images/a.png)', { baseDir: 'D:/notes/ch1' })
    const src = html.match(/src="(remda-img:\/\/local\/\?path=[^"]+)"/)?.[1]
    expect(src).toBeTruthy()
    expect(localPath(src!)).toBe('D:/notes/ch1/images/a.png')
  })

  it('removes images with unsafe schemes', async () => {
    const html = await renderMarkdown('![x](javascript:alert(1))')
    expect(html).not.toContain('<img')
  })
})
