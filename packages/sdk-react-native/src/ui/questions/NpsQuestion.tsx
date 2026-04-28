import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NpsQuestion as NpsQ } from '@ritmus/sdk-core'
import type { ResolvedTheme } from '../theme.js'
import { QuestionImageHeader } from '../QuestionImageHeader.js'

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
  // 10 → 0 reads more naturally than 0 → 10 in a vertical stack:
  // the highest / most-promoter answer sits at the top with its
  // label, and the row tapers down to the detractor side. 11 chips
  // crammed in a horizontal row truncate awkwardly on phones — a
  // full-width vertical list is the parity layout the user asked for.
  const items = Array.from({ length: 11 }, (_, i) => 10 - i)
  const lowLabel = question.lowLabel ?? 'Not at all likely'
  const highLabel = question.highLabel ?? 'Extremely likely'
  return (
    <View>
      {question.imageUrl ? (
        <QuestionImageHeader uri={question.imageUrl} radius={theme.radius} />
      ) : null}
      <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
        {question.title}
      </Text>
      {question.subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {question.subtitle}
        </Text>
      ) : null}
      <View style={styles.column}>
        {items.map((n) => {
          const selected = score === n
          const endpointLabel =
            n === 10 ? highLabel : n === 0 ? lowLabel : null
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
                styles.cell,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? theme.colors.background : theme.colors.text,
                  fontFamily: theme.fontFamily,
                  fontWeight: '700',
                  fontSize: 16,
                  minWidth: 24,
                }}
              >
                {n}
              </Text>
              {endpointLabel ? (
                <Text
                  style={{
                    color: selected ? theme.colors.background : theme.colors.subtext,
                    fontFamily: theme.fontFamily,
                    marginLeft: 12,
                    fontSize: 13,
                  }}
                >
                  {endpointLabel}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
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
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, marginBottom: 12, textAlign: 'center' },
  column: { flexDirection: 'column', gap: 8, marginTop: 12 },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
})
