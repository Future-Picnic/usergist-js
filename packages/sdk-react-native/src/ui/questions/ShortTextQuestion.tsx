import React from 'react'
import { View } from 'react-native'
import type { ShortTextQuestion as STQ } from '@usergist/sdk-core/mobile'
import type { ResolvedTheme } from '../theme.js'
import { QuestionHeader, SurfaceField } from '../SurfacePrimitives.js'

interface Props {
  readonly question: STQ
  readonly value: string
  readonly onChange: (s: string) => void
  readonly theme: ResolvedTheme
}

export function ShortTextQuestion({ question, value, onChange, theme }: Props): React.ReactElement {
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl} theme={theme} />
      <SurfaceField
        theme={theme}
        accessibilityLabel="Feedback text answer"
        testID={`feedback-question-${question.id}-input`}
        value={value}
        onChangeText={onChange}
        placeholder={question.placeholder ?? ''}
        maxLength={question.maxLength}
        multiline
        minHeight={96}
      />
    </View>
  )
}
