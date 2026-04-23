import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NpsQuestion as NpsQ } from '@ritmus/sdk-core'
import type { ResolvedTheme } from '../theme.js'

interface Props {
  readonly question: NpsQ
  readonly score: number | null
  readonly followUp: string
  readonly onScore: (n: number) => void
  readonly onFollowUp: (s: string) => void
  readonly theme: ResolvedTheme
}

export function NpsQuestion({
  question,
  score,
  followUp,
  onScore,
  onFollowUp,
  theme,
}: Props): React.ReactElement {
  const [showFollowUp, setShowFollowUp] = useState<boolean>(score != null)
  const items = Array.from({ length: 11 }, (_, i) => i)
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
          const selected = score === n
          return (
            <Pressable
              key={n}
              onPress={() => {
                onScore(n)
                setShowFollowUp(true)
              }}
              accessibilityRole="button"
              accessibilityLabel={`Score ${n}`}
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
      <View style={styles.labelsRow}>
        <Text style={[styles.endLabel, { color: theme.colors.subtext }]}>Not at all likely</Text>
        <Text style={[styles.endLabel, { color: theme.colors.subtext }]}>Extremely likely</Text>
      </View>
      {showFollowUp && question.followUp ? (
        <View style={{ marginTop: 16 }}>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.text, marginBottom: 8, fontFamily: theme.fontFamily },
            ]}
          >
            {question.followUp}
          </Text>
          <TextInput
            value={followUp}
            onChangeText={onFollowUp}
            placeholder="Tell us more..."
            placeholderTextColor={theme.colors.subtext}
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontFamily: theme.fontFamily,
              },
            ]}
            multiline
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  endLabel: { fontSize: 12 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
})
