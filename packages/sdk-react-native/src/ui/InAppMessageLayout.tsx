// Presentational body for in-app messages (card, full screen, slide-up).
// InAppMessageView owns timing, animation and dismissal; this file owns layout.
import React from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ArmedInAppMessage, InAppCta } from '@usergist/sdk-core/mobile'
import { CONTENT_MAX_WIDTH, SurfaceClose, SurfaceNext, SurfaceSecondary } from './SurfaceControls.js'
import type { ResolvedTheme } from './theme.js'

type Format = 'card' | 'full' | 'slide'

interface Props {
  readonly message: ArmedInAppMessage
  readonly format: Format
  readonly theme: ResolvedTheme
  readonly landscape: boolean
  readonly onClose: () => void
  readonly onCta: (cta: InAppCta, index: number) => void
  /** Cap for the pinned action area; beyond it the actions scroll. */
  readonly maxFooterHeight: number
}

export function InAppMessageLayout({ message, format, theme, landscape, onClose, onCta, maxFooterHeight }: Props): React.ReactElement {
  const close = <SurfaceClose onPress={onClose} color={theme.colors.text} testID="inapp-close" />
  const text = (
    <View style={format === 'slide' ? styles.slideText : styles.text}>
      <Text accessibilityRole="header" style={[format === 'full' ? styles.fullTitle : styles.title,
        { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
        {message.title}
      </Text>
      {message.body ? (
        <Text style={[format === 'full' ? styles.fullBody : styles.body,
          { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {message.body}
        </Text>
      ) : null}
    </View>
  )
  // Stack actions in portrait so long labels never truncate; side by side in
  // landscape where height is scarce. The first CTA is the primary action.
  const stacked = !landscape && format !== 'slide'
  const ctas = message.ctas.length > 0 ? (
    <View style={[styles.ctas, stacked ? styles.ctasStacked : styles.ctasRow]}>
      {message.ctas.map((cta, i) => (
        <View key={i} style={stacked ? undefined : styles.ctaFlex}>
          {i === 0 ? (
            <SurfaceNext onPress={() => onCta(cta, i)} disabled={false} theme={theme}
              label={cta.label} compact={format === 'slide'} testID={`inapp-cta-${i}`} />
          ) : (
            <SurfaceSecondary onPress={() => onCta(cta, i)} theme={theme}
              label={cta.label} compact={format === 'slide'} testID={`inapp-cta-${i}`} />
          )}
        </View>
      ))}
    </View>
  ) : null
  const image = message.imageUrl ? (
    <Image
      source={{ uri: message.imageUrl }}
      style={[format === 'full' ? styles.fullImage : format === 'slide' ? styles.slideImage : styles.cardImage,
        { borderRadius: Math.max(8, theme.radius - 8) }, landscape && format !== 'slide' && styles.landscapeImage]}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    />
  ) : null
  // Pinned actions keep their natural height up to maxFooterHeight and only
  // scroll beyond it, so long labels or large accessibility text are never
  // clipped and never take all the height from the message body.
  const footer = (style: object) => ctas ? (
    <ScrollView style={[styles.footerScroll, { maxHeight: maxFooterHeight }]} contentContainerStyle={style} bounces={false}
      showsVerticalScrollIndicator={false}>
      {ctas}
    </ScrollView>
  ) : null

  if (format === 'slide') {
    return (
      <View style={styles.slide}>
        <View style={styles.slideRow}>
          {close}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.slideScroll} bounces={false}>
            {text}
            {image}
          </ScrollView>
        </View>
        {footer(styles.slideFooter)}
      </View>
    )
  }

  if (format === 'full') {
    return (
      <View style={styles.fullRoot}>
        <View style={styles.fullHeader}>{close}</View>
        <ScrollView style={[styles.scroll, styles.bodyScroll]} contentContainerStyle={styles.fullScroll}>
          <View style={styles.measure}>
            {image}
            {text}
          </View>
        </ScrollView>
        {footer([styles.measure, styles.fullFooter])}
      </View>
    )
  }

  return (
    <>
      <View style={styles.cardHeader}>{close}</View>
      <ScrollView style={[styles.scroll, styles.bodyScroll]} contentContainerStyle={styles.cardScroll}>
        {image}
        {text}
      </ScrollView>
      {footer(styles.cardFooter)}
    </>
  )
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  // Body keeps at least a readable slice; the footer shrinks and scrolls first.
  bodyScroll: { minHeight: 96 },
  footerScroll: { flexGrow: 0, flexShrink: 0 },
  slideScroll: { gap: 10, paddingBottom: 2 },
  slideImage: { width: '100%', height: 120 },
  slideFooter: { paddingTop: 2 },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  text: { gap: 8 },
  slideText: { gap: 4, paddingTop: 10, paddingRight: 8 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22 },
  fullTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  fullBody: { fontSize: 17, lineHeight: 26 },
  ctas: { gap: 10 },
  ctasStacked: { flexDirection: 'column' },
  ctasRow: { flexDirection: 'row-reverse' },
  ctaFlex: { flex: 1 },
  cardImage: { width: '100%', height: 168, marginBottom: 18 },
  fullImage: { width: '100%', height: 240, marginBottom: 24 },
  landscapeImage: { height: 128 },
  cardHeader: { paddingHorizontal: 8, paddingTop: 8 },
  cardScroll: { paddingHorizontal: 22, paddingBottom: 8 },
  cardFooter: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 22 },
  fullRoot: { flex: 1 },
  fullHeader: { paddingHorizontal: 12, paddingTop: 4 },
  fullScroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' },
  fullFooter: { paddingHorizontal: 24, paddingTop: 8 },
  slide: { padding: 8, paddingBottom: 14, gap: 10, flexShrink: 1 },
  slideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, flexShrink: 1 },
})
