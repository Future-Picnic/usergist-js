import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { ArmedInAppMessage, InAppCta, InAppMessageFormat, PromptTheme } from '@usergist/sdk-core/mobile'
import { InAppMessageLayout } from '../ui/InAppMessageLayout.js'
import { DEFAULT_THEME, mergeTheme, surfaceTokens } from '../ui/theme.js'

export interface InAppMessageShellProps {
  readonly format: InAppMessageFormat
  readonly title: string
  readonly body: string
  readonly imageUrl?: string | null
  readonly backgroundColor?: string | null
  readonly accentColor?: string | null
  readonly backdropEnabled?: boolean
  readonly ctas: ReadonlyArray<InAppCta>
  readonly theme?: PromptTheme
}

/** The runtime message layout, without engine, Modal or delivery callbacks. */
export function InAppMessageShell(props: InAppMessageShellProps) {
  const [size, setSize] = useState({ width: 320, height: 600 })
  const full = props.format === 'modal_full'
  const slide = props.format === 'slideup'
  const theme = mergeTheme(mergeTheme(DEFAULT_THEME, props.theme), {
    colors: {
      background: props.backgroundColor ?? props.theme?.colors?.background,
      primary: props.accentColor ?? props.theme?.colors?.primary,
    },
  })
  const message: ArmedInAppMessage = {
    messageId: 'preview', eventName: 'preview', format: props.format,
    title: props.title, body: props.body, imageUrl: props.imageUrl ?? null,
    backgroundColor: props.backgroundColor ?? null, accentColor: props.accentColor ?? null,
    ctas: props.ctas, autoDismissSeconds: null, screenAllowlist: [], screenDenylist: [], forceShow: false,
  }
  return <View onLayout={event => setSize(event.nativeEvent.layout)} style={[styles.root, {
    paddingTop: full ? 36 : 44,
    justifyContent: slide ? 'flex-end' : 'center',
    backgroundColor: full ? theme.colors.background : props.backdropEnabled !== false ? surfaceTokens(theme).scrim : 'transparent',
  }]}>
    <View style={[styles.surface, {
      backgroundColor: theme.colors.background,
      borderRadius: full ? 0 : theme.radius,
      maxWidth: full ? undefined : size.width > size.height ? 560 : 400,
      ...(full ? { flex: 1 } : {}),
    }]}>
      <InAppMessageLayout message={message} theme={theme} format={full ? 'full' : slide ? 'slide' : 'card'}
        landscape={size.width > size.height} maxFooterHeight={Math.max(80, size.height * 0.4)}
        onClose={() => undefined} onCta={() => undefined} />
    </View>
  </View>
}
const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, paddingBottom: 16, alignItems: 'center' },
  surface: { width: '100%', maxHeight: '100%', flexShrink: 1, overflow: 'hidden' },
})
