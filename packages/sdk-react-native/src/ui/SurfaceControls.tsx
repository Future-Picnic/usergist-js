// Shared chrome for every UserGist surface: one Close, one Back, one primary
// action and one header layout. All colours derive from the campaign theme.
//
// Survey navigation groups Close then Back in landscape; portrait keeps Back
// leading and Close trailing when Back exists. Primary actions use a readable-
// width portrait footer and the trailing landscape header. Messages and
// requests reuse the themed control faces without opting into landscape sizing.
import React from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { surfaceTokens, withAlpha, type ResolvedTheme } from './theme.js'

/**
 * Readable measure for content. Sheet backgrounds span the full width; the
 * content inside them (and inside full-screen surfaces) stays within this.
 */
export const CONTENT_MAX_WIDTH = 560

// Use the host's live safe area, including rotation. The fallback keeps SDK
// modals usable in apps which have not mounted a SafeAreaProvider.
export function useSurfaceLayout() {
  const { width, height } = useWindowDimensions()
  const landscape = width > height
  const safe = React.useContext(SafeAreaInsetsContext)
  return {
    width, height, landscape,
    top: safe?.top ?? (Platform.OS === 'ios' && !landscape ? 50 : 24),
    bottom: safe?.bottom ?? 16,
    left: safe?.left ?? (landscape && Platform.OS === 'ios' ? 44 : 0),
    right: safe?.right ?? (landscape && Platform.OS === 'ios' ? 44 : 0),
  }
}

type SurfaceIconSize = 'small' | 'regular'

function IconButton({ onPress, face, size, testID, label, children }: {
  onPress: () => void; face: string; size: SurfaceIconSize; testID?: string; label: string; children: React.ReactNode
}) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={label}
      hitSlop={4} style={({ pressed }) => [styles.iconHit, { opacity: pressed ? 0.6 : 1 }]}>
      <View pointerEvents="none" style={[styles.iconFace, size === 'regular' && styles.regularIconFace, { backgroundColor: face }]}>
        {children}
      </View>
    </Pressable>
  )
}

/**
 * The single Close control. `color` is the theme text colour; the face is a
 * quiet wash of that colour so it reads on any background.
 */
export function SurfaceClose({ onPress, color, size = 'small', testID, label = 'Close' }: {
  onPress: () => void; color: string; size?: SurfaceIconSize; testID?: string; label?: string
}) {
  return (
    <IconButton onPress={onPress} face={withAlpha(color, 0.08)} size={size} testID={testID} label={label}>
      <View style={[styles.stroke, size === 'regular' && styles.regularStroke, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.stroke, size === 'regular' && styles.regularStroke, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
    </IconButton>
  )
}

/** Back uses the same face as Close, with a drawn chevron. */
export function SurfaceBack({ onPress, color, size = 'small', testID, label = 'Back' }: {
  onPress: () => void; color: string; size?: SurfaceIconSize; testID?: string; label?: string
}) {
  return (
    <IconButton onPress={onPress} face={withAlpha(color, 0.08)} size={size} testID={testID} label={label}>
      <View style={[styles.chevron, size === 'regular' && styles.regularChevron, { borderColor: color }]} />
    </IconButton>
  )
}

export function SurfaceNext({ onPress, disabled, loading = false, compact = false, theme, testID, label = 'Next' }: {
  onPress: () => void; disabled: boolean; loading?: boolean; compact?: boolean
  theme: ResolvedTheme; testID?: string; label?: string
}) {
  const tokens = surfaceTokens(theme)
  const inactive = disabled && !loading
  const fg = inactive ? withAlpha(theme.colors.text, 0.38) : tokens.onPrimary
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} testID={testID}
      accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [styles.next, compact && styles.compactNext,
        { backgroundColor: inactive ? tokens.fill : theme.colors.primary, opacity: pressed ? 0.82 : 1 }]}>
      {loading ? <ActivityIndicator color={tokens.onPrimary} /> :
        <Text style={[styles.nextLabel, compact && styles.compactLabel,
          { color: fg, fontFamily: theme.fontFamily }]}>{label}</Text>}
    </Pressable>
  )
}

/**
 * Quiet secondary action. Uses the text colour with a neutral outline: a
 * primary-coloured label is unreadable when the brand colour is light
 * (yellow, mint) on a light background.
 */
export function SurfaceSecondary({ onPress, theme, label, testID, compact = false }: {
  onPress: () => void; theme: ResolvedTheme; label: string; testID?: string; compact?: boolean
}) {
  const tokens = surfaceTokens(theme)
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.next, compact && styles.compactNext, styles.secondary,
        { borderColor: withAlpha(theme.colors.text, 0.16), backgroundColor: pressed ? tokens.fill : 'transparent' }]}>
      <Text style={[styles.nextLabel, compact && styles.compactLabel,
        { color: theme.colors.text, fontFamily: theme.fontFamily }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * Three-slot header. Leading and trailing slots size to their content; the
 * centre takes the remaining width (progress, title or grabber). Landscape
 * question headers can reserve equal sides for two 44pt icons and an 8pt gap.
 */
export function SurfaceHeader({ leading, center, trailing, balancedSides = false }: {
  leading?: React.ReactNode; center?: React.ReactNode; trailing?: React.ReactNode; balancedSides?: boolean
}) {
  return (
    <View style={styles.header}>
      <View style={[styles.side, balancedSides && styles.balancedSide]}>{leading}</View>
      <View style={styles.center}>{center}</View>
      <View style={[styles.side, balancedSides && styles.balancedSide, styles.trailing]}>{trailing}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconFace: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  regularIconFace: { width: 44, height: 44, borderRadius: 22 },
  stroke: { position: 'absolute', width: 13, height: 1.75, borderRadius: 1 },
  regularStroke: { width: 16, height: 2 },
  chevron: { width: 9, height: 9, borderLeftWidth: 1.75, borderBottomWidth: 1.75, marginLeft: 3, transform: [{ rotate: '45deg' }] },
  regularChevron: { width: 10, height: 10, borderLeftWidth: 2, borderBottomWidth: 2 },
  // Labels wrap instead of truncating; the fixed radius keeps a pill on one
  // line and a soft rounded rectangle when a long or enlarged label wraps.
  next: { minHeight: 50, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  compactNext: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 10, minWidth: 88, borderRadius: 22 },
  secondary: { borderWidth: 1.5 },
  nextLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.1, textAlign: 'center' },
  compactLabel: { fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
  side: { minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  balancedSide: { minWidth: 96, gap: 8 },
  // Long header action labels wrap within this width instead of squeezing the title.
  trailing: { justifyContent: 'flex-end', maxWidth: 320 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
