import React from 'react'
import { StyleSheet, View } from 'react-native'
import type { MultipleChoiceQuestion as MCQ } from '@usergist/sdk-core/mobile'
import type { ResolvedTheme } from '../theme.js'
import { ChoiceRow, QuestionHeader } from '../SurfacePrimitives.js'

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
  const subtitle = question.subtitle ?? (question.multiSelect ? 'Choose all that apply' : null)
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={subtitle} imageUrl={question.imageUrl} theme={theme} />
      <View style={styles.list}>
        {question.options.map((opt) => (
          <ChoiceRow
            key={opt.id}
            label={opt.label}
            selected={selectedSet.has(opt.id)}
            kind={question.multiSelect ? 'checkbox' : 'radio'}
            onPress={() => toggle(opt.id)}
            theme={theme}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8 },
})
