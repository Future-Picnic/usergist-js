import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RatingQuestion as RatingQ } from '@ritmus/sdk-core'
import type { ResolvedTheme } from '../theme.js'

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
 *   - 'numeric' → row of chips with the score
 *   - 'emoji'   → 5 emoji faces (only valid when scale=5; falls back
 *                 to stars otherwise so we never silently skip render)
 *
 * The row is centred so the dashboard preview and the device match.
 */
export function RatingQuestion({ question, value, onChange, theme }: Props): React.ReactElement {
  const items = Array.from({ length: question.scale }, (_, i) => i + 1)
  const display: 'stars' | 'numeric' | 'emoji' =
    question.display ?? 'stars'
  const renderEmoji = display === 'emoji' && question.scale === 5

  return (
    <View>
      <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
        {question.title}
      </Text>
      {question.subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {question.subtitle}
        </Text>
      ) : null}
      <View style={styles.row}>
        {items.map((n) => {
          const selected = value === n
          if (renderEmoji) {
            const glyph = EMOJI_5[n - 1] ?? '🙂'
            return (
              <Pressable
                key={n}
                onPress={() => onChange(n)}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n}`}
                style={[
                  styles.emoji,
                  { opacity: selected || value === null ? 1 : 0.35 },
                ]}
              >
                <Text style={styles.emojiGlyph}>{glyph}</Text>
              </Pressable>
            )
          }
          if (display === 'stars') {
            const filled = value != null && n <= value
            return (
              <Pressable
                key={n}
                onPress={() => onChange(n)}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n}`}
                style={styles.starBtn}
              >
                <Text
                  style={{
                    fontSize: 28,
                    lineHeight: 32,
                    color: filled ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  ★
                </Text>
              </Pressable>
            )
          }
          // 'numeric' — chip with the score
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${n}`}
              style={[
                styles.chip,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? theme.colors.background : theme.colors.text,
                  fontFamily: theme.fontFamily,
                  fontWeight: '600',
                }}
              >
                {n}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {(question.lowLabel || question.highLabel) && (
        <View style={styles.labelsRow}>
          <Text style={[styles.endLabel, { color: theme.colors.subtext }]}>{question.lowLabel ?? ''}</Text>
          <Text style={[styles.endLabel, { color: theme.colors.subtext }]}>{question.highLabel ?? ''}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    justifyContent: 'center',
  },
  chip: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 30,
    lineHeight: 36,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  endLabel: { fontSize: 12 },
})
