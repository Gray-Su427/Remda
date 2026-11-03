import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** 距底部多少像素以内仍视为贴底，避免像素取整让状态来回翻转。 */
const NEAR_BOTTOM_PX = 32

const isNearBottom = (el: HTMLElement): boolean =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX

interface StickToBottom {
  scrollRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  atBottom: boolean
  scrollToBottom: () => void
}

/**
 * 让滚动容器在内容变化时贴住底部。
 *
 * 流式输出时内容高度是异步变化的（Markdown 渲染、换行、图片加载），
 * 用平滑滚动会在每个 token 上重启动画并追逐过期的 scrollHeight。
 * 这里改为：只在贴底状态下，尺寸变化后立即设置 scrollTop。
 *
 * 程序化滚底产生的 scroll 事件是异步派发的，派发时内容可能又长高了，
 * 不能只用距离判断「用户是否上滚」。因此记录程序化滚动的位置：
 * 命中它的事件直接忽略；其余事件按距底距离决定暂停或恢复跟随。
 */
export function useStickToBottom(pinKey: string): StickToBottom {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const lastTopRef = useRef(0)
  const programmaticTopRef = useRef<number | null>(null)
  const [atBottom, setAtBottom] = useState(true)

  const setPinned = useCallback((next: boolean): void => {
    if (pinnedRef.current === next) return
    pinnedRef.current = next
    setAtBottom(next)
  }, [])

  const stick = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    lastTopRef.current = el.scrollTop
    if (el.scrollTop !== before) programmaticTopRef.current = el.scrollTop
  }, [])

  const scrollToBottom = useCallback((): void => {
    stick()
    setPinned(true)
  }, [stick, setPinned])

  // 追加新消息或切换文档时强制贴底。
  useLayoutEffect(() => {
    pinnedRef.current = true
    setAtBottom(true)
    stick()
  }, [pinKey, stick])

  // 内容或容器尺寸变化后补滚：覆盖异步 HTML、换行、图片与面板拖动。
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) return
      // 位置被外部改动且已离开底部：用户上滚了，等 scroll 事件确认后停止跟随。
      if (el.scrollTop !== lastTopRef.current && !isNearBottom(el)) {
        lastTopRef.current = el.scrollTop
        setPinned(false)
        return
      }
      stick()
    })
    observer.observe(content)
    observer.observe(el)
    return () => observer.disconnect()
  }, [setPinned, stick])

  // 用户手动滚动时暂停/恢复跟随。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => {
      const top = el.scrollTop
      if (programmaticTopRef.current === top) {
        programmaticTopRef.current = null
        lastTopRef.current = top
        return
      }
      programmaticTopRef.current = null
      lastTopRef.current = top
      setPinned(isNearBottom(el))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [setPinned])

  return { scrollRef, contentRef, atBottom, scrollToBottom }
}
