import { createContext, useCallback, useEffect, useRef } from 'react'
import { Keyboard, ScrollView, View, type LayoutChangeEvent } from 'react-native'

// A surface owns scrolling; fields only register focus. Keep the first input
// line visible when the keyboard and the pinned footer shrink the viewport.
export const SurfaceFieldFocus = createContext<((field: View | null) => void) | null>(null)

export function useSurfaceFieldReveal() {
  const scrollRef = useRef<ScrollView>(null)
  const contentRef = useRef<View>(null)
  const focused = useRef<View | null>(null)
  const contentTop = useRef(0)
  const reveal = useCallback(() => {
    const field = focused.current
    const content = contentRef.current
    if (!field || !content) return
    field.measureLayout(content, (_x, y) => {
      if (focused.current === field) scrollRef.current?.scrollTo({ y: Math.max(0, contentTop.current + y - 8), animated: false })
    }, () => {})
  }, [])
  const onFocus = useCallback((field: View | null) => {
    focused.current = field
    if (field) requestAnimationFrame(reveal)
  }, [reveal])
  const onContentLayout = useCallback((event: LayoutChangeEvent) => {
    contentTop.current = event.nativeEvent.layout.y
  }, [])
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', reveal)
    const resize = Keyboard.addListener('keyboardDidChangeFrame', reveal)
    return () => { show.remove(); resize.remove() }
  }, [reveal])
  return { scrollRef, contentRef, onFocus, onContentLayout, reveal }
}
