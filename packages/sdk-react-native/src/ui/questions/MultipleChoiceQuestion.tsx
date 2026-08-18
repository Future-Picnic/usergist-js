import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MultipleChoiceQuestion as MCQ } from '@usergist/sdk-core/mobile'
import type { ResolvedTheme } from '../theme.js'
import { QuestionImageHeader } from '../QuestionImageHeader.js'

interface Props {
  readonly question: MCQ
  readonly value: ReadonlyArray<string>
  readonly onChange: (v: ReadonlyArray<string>) => void
  readonly theme: ResolvedTheme
}

export function MultipleChoiceQuestion({
  question,
  value,
  onChange,
  theme,
}: Props): React.ReactElement {
  const selectedSet = new Set(value)
  function toggle(id: string): void {
    if (question.multiSelect) {
      if (selectedSet.has(id)) onChange(value.filter((v) => v !== id))
      else onChange([...value, id])
    } else {
      onChange([id])
    }
  }
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
      <View style={{ marginTop: 8, gap: 8 }}>
        {question.options.map((opt) => {
          const selected = selectedSet.has(opt.id)
          return (
            <Pressable
              key={opt.id}
              onPress={() => toggle(opt.id)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              style={[
                styles.option,
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
                  fontWeight: '600',
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 8 },
  option: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
})
