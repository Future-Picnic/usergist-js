import React from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { ShortTextQuestion as STQ } from '@usergist/sdk-core'
import type { ResolvedTheme } from '../theme.js'
import { QuestionImageHeader } from '../QuestionImageHeader.js'

interface Props {
  readonly question: STQ
  readonly value: string
  readonly onChange: (s: string) => void
  readonly theme: ResolvedTheme
}

export function ShortTextQuestion({ question, value, onChange, theme }: Props): React.ReactElement {
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
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={question.placeholder ?? ''}
        placeholderTextColor={theme.colors.subtext}
        maxLength={question.maxLength}
        multiline
        style={[
          styles.input,
          {
            borderColor: theme.colors.border,
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 12 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
})
