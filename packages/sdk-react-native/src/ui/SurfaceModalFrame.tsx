import React, { useEffect, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import type { useSurfaceLayout } from './SurfaceControls.js'

export type SurfaceModalLayout = ReturnType<typeof useSurfaceLayout>

// A native Modal can rotate independently of its host screen. Measure its own
// bounds and safe area instead of inheriting stale landscape host metrics.
export function SurfaceModalFrame({ onChange, children }: {
  onChange: (layout: SurfaceModalLayout) => void; children: React.ReactNode
}) {
  return <SafeAreaProvider><ModalBounds onChange={onChange}>{children}</ModalBounds></SafeAreaProvider>
}

function ModalBounds({ onChange, children }: {
  onChange: (layout: SurfaceModalLayout) => void; children: React.ReactNode
}) {
  const safe = useSafeAreaInsets()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const { top, bottom, left, right } = safe
  useEffect(() => {
    if (size.width > 0 && size.height > 0) onChange({ ...size, landscape: size.width > size.height, top, bottom, left, right })
  }, [size.width, size.height, top, bottom, left, right, onChange])
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
  }
  return <View style={{ flex: 1 }} onLayout={measure}>{children}</View>
}
