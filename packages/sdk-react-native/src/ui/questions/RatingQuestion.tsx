import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RatingQuestion as RatingQ } from '@usergist/sdk-core/mobile'
import { surfaceTokens, withAlpha, type ResolvedTheme } from '../theme.js'
import { QuestionHeader } from '../SurfacePrimitives.js'

interface Props {
  readonly question: RatingQ
  readonly value: number | null
  readonly onChange: (v: number) => void
  readonly theme: ResolvedTheme
}

const EMOJI_5 = ['😡', '😕', '😐', '🙂', '😍'] as const

/**
 * Rating question. Honours `question.display`:
 *   - 'stars'   → row of star glyphs (default)
 *   - 'numeric' → row of score chips
 *   - 'emoji'   → 5 faces (only valid when scale=5; falls back to stars)
 *
 * The row is centred so the dashboard preview and the device match.
 */
export function RatingQuestion({ question, value, onChange, theme }: Props): React.ReactElement {
  const items = Array.from({ length: question.scale }, (_, i) => i + 1)
  const display: 'stars' | 'numeric' | 'emoji' = question.display ?? 'stars'
  const renderEmoji = display === 'emoji' && question.scale === 5
  const tokens = surfaceTokens(theme)

  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl}
        theme={theme} align="center" />
      <View style={styles.row}>
        {items.map((n) => {
          const selected = value === n
          if (renderEmoji) {
            const glyph = EMOJI_5[n - 1] ?? '🙂'
            return (
              <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio"
                accessibilityState={{ selected }} accessibilityLabel={`Rate ${n}`}
                style={[styles.emoji, {
                  backgroundColor: selected ? tokens.tint : 'transparent',
                  opacity: selected || value === null ? 1 : 0.4,
                }]}>
                <Text style={styles.emojiGlyph}>{glyph}</Text>
              </Pressable>
            )
          }
          if (display === 'stars') {
            const filled = value != null && n <= value
            return (
              <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio"
                accessibilityState={{ selected }} accessibilityLabel={`Rate ${n}`} style={styles.starBtn}>
                <Text style={[styles.star, { color: filled ? theme.colors.primary : withAlpha(theme.colors.text, 0.16) }]}>
                  ★
                </Text>
              </Pressable>
            )
          }
          return (
            <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio"
              accessibilityState={{ selected }} accessibilityLabel={`Rate ${n}`}
              style={({ pressed }) => [styles.chip, {
                borderRadius: Math.min(theme.radius, 12),
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : pressed ? tokens.fill : 'transparent',
              }]}>
              <Text style={[styles.chipLabel, {
                color: selected ? tokens.onPrimary : theme.colors.text,
                fontFamily: theme.fontFamily,
              }]}>
                {n}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {(question.lowLabel || question.highLabel) && (
        <View style={styles.labelsRow}>
          <Text style={[styles.endLabel, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>{question.lowLabel ?? ''}</Text>
          <Text style={[styles.endLabel, { color: theme.colors.subtext, fontFamily: theme.fontFamily, textAlign: 'right' }]}>{question.highLabel ?? ''}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { minWidth: 48, height: 48, paddingHorizontal: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  starBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 34, lineHeight: 40 },
  emoji: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  emojiGlyph: { fontSize: 30, lineHeight: 36 },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 16 },
  endLabel: { fontSize: 13, flex: 1 },
})
