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

export function RatingQuestion({ question, value, onChange, theme }: Props): React.ReactElement {
  const items = Array.from({ length: question.scale }, (_, i) => i + 1)
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
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  endLabel: { fontSize: 12 },
})
