import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { NpsQuestion as NpsQ } from '@usergist/sdk-core/mobile'
import { surfaceTokens, type ResolvedTheme } from '../theme.js'
import { QuestionHeader, SurfaceField } from '../SurfacePrimitives.js'

interface Props {
  readonly question: NpsQ
  readonly score: number | null
  readonly followUp: string
  readonly onScore: (n: number) => void
  readonly onFollowUp: (s: string) => void
  readonly theme: ResolvedTheme
}

/**
 * NPS scale.
 * - Wide layouts (landscape, tablets): the familiar 0–10 row with endpoint
 *   labels underneath — each cell is wide enough to tap comfortably.
 * - Narrow portrait: a compact vertical list, 10 at the top, so no number is
 *   squeezed below a usable touch target (the previously agreed layout).
 */
export function NpsQuestion({
  question,
  score,
  followUp,
  onScore,
  onFollowUp,
  theme,
}: Props): React.ReactElement {
  const [showFollowUp, setShowFollowUp] = useState<boolean>(score != null)
  // Measure the actual surface, not the host window (dashboard phone previews
  // and embedded surfaces can be much narrower than the desktop viewport).
  const [width, setWidth] = useState(0)
  const wide = width >= 524
  const lowLabel = question.lowLabel ?? 'Not at all likely'
  const highLabel = question.highLabel ?? 'Extremely likely'
  const tokens = surfaceTokens(theme)
  const pick = (n: number): void => {
    onScore(n)
    setShowFollowUp(true)
  }
  const items = wide
    ? Array.from({ length: 11 }, (_, i) => i)
    : Array.from({ length: 11 }, (_, i) => 10 - i)

  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl}
        theme={theme} align={wide ? 'center' : 'left'} />
      <View style={wide ? styles.row : styles.column}>
        {items.map((n) => {
          const selected = score === n
          const endpoint = wide ? null : n === 10 ? highLabel : n === 0 ? lowLabel : null
          return (
            <Pressable
              key={n}
              onPress={() => pick(n)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Score ${n}${n === 10 ? `, ${highLabel}` : n === 0 ? `, ${lowLabel}` : ''}`}
              style={({ pressed }) => [wide ? styles.cellWide : styles.cellTall, {
                borderRadius: Math.min(theme.radius, 12),
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : pressed ? tokens.fill : 'transparent',
              }]}
            >
              <Text style={[styles.number, wide && styles.numberWide, {
                color: selected ? tokens.onPrimary : theme.colors.text,
                fontFamily: theme.fontFamily,
              }]}>
                {n}
              </Text>
              {endpoint ? (
                <Text style={[styles.endpoint, {
                  color: selected ? tokens.onPrimary : theme.colors.subtext,
                  fontFamily: theme.fontFamily,
                }]}>
                  {endpoint}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>
      {wide ? (
        <View style={styles.labels}>
          <Text style={[styles.endLabel, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>{lowLabel}</Text>
          <Text style={[styles.endLabel, { color: theme.colors.subtext, fontFamily: theme.fontFamily, textAlign: 'right' }]}>{highLabel}</Text>
        </View>
      ) : null}
      {showFollowUp && question.followUp ? (
        <View style={styles.followUp}>
          <Text style={[styles.followUpTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
            {question.followUp}
          </Text>
          <SurfaceField
            theme={theme}
            value={followUp}
            onChangeText={onFollowUp}
            placeholder="Tell us more"
            accessibilityLabel={question.followUp}
            multiline
            minHeight={80}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  column: { gap: 6 },
  cellWide: { flex: 1, height: 48, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cellTall: {
    flexDirection: 'row', alignItems: 'center', minHeight: 44,
    paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.5,
  },
  // The tall list keeps a fixed number column so endpoint labels line up.
  number: { fontSize: 16, fontWeight: '700', minWidth: 22, fontVariant: ['tabular-nums'] },
  // In the 0–10 row each numeral is centred in its own cell, including 10.
  numberWide: { minWidth: 0, textAlign: 'center' },
  endpoint: { fontSize: 14, marginLeft: 10 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 16 },
  endLabel: { fontSize: 13, flex: 1 },
  followUp: { marginTop: 24 },
  followUpTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
})
