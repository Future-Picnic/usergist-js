// Bottom-sheet modal that renders an armed prompt and collects answers.
//
// Supports rating, NPS, multiple_choice, short_text. Questions are shown one
// at a time; "Next" advances, the last question has "Submit". "Skip" dismisses
// and records a dismissal. Tapping the scrim also dismisses.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { Question } from '@ritmus/sdk-core'
import type { ShowPromptPayload, ResponseEmission } from '../internal/types.js'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from './theme.js'
import { animateIn, animateOut } from './animations.js'
import { RatingQuestion } from './questions/RatingQuestion.js'
import { NpsQuestion } from './questions/NpsQuestion.js'
import { MultipleChoiceQuestion } from './questions/MultipleChoiceQuestion.js'
import { ShortTextQuestion } from './questions/ShortTextQuestion.js'

type AnswerRecord = Record<string, number | string | ReadonlyArray<string> | null>

interface Props {
  readonly payload: ShowPromptPayload | null
  readonly themeOverride?: ResolvedTheme
  readonly onSubmit: (r: ResponseEmission) => void
  readonly onDismiss: (r: ResponseEmission) => void
}

export function PromptSheet({
  payload,
  themeOverride,
  onSubmit,
  onDismiss,
}: Props): React.ReactElement | null {
  const [visible, setVisible] = useState<boolean>(false)
  const [index, setIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<AnswerRecord>({})
  const translate = useRef(new Animated.Value(0)).current
  const height = Dimensions.get('window').height

  const theme: ResolvedTheme = useMemo(() => {
    if (themeOverride) return mergeTheme(themeOverride, payload?.theme)
    return mergeTheme(DEFAULT_THEME, payload?.theme)
  }, [themeOverride, payload?.theme])

  useEffect(() => {
    if (payload) {
      setAnswers({})
      setIndex(0)
      setVisible(true)
      requestAnimationFrame(() => animateIn(translate))
    }
  }, [payload, translate])

  if (!payload) return null

  const questions: ReadonlyArray<Question> = payload.prompt.questions
  const current = questions[index]
  const isLast = index >= questions.length - 1

  function close(kind: 'submit' | 'dismiss'): void {
    animateOut(translate, () => {
      setVisible(false)
      const latencyMs = Date.now() - (payload?.shownAt ?? Date.now())
      const result: ResponseEmission = {
        promptId: payload!.promptId,
        answers: Object.keys(answers).map((qid) => ({
          questionId: qid,
          value: answers[qid] ?? null,
        })),
        dismissed: kind === 'dismiss',
        latencyMs,
      }
      if (kind === 'submit') onSubmit(result)
      else onDismiss(result)
    })
  }

  function setAnswer(qid: string, v: number | string | ReadonlyArray<string> | null): void {
    setAnswers((prev) => ({ ...prev, [qid]: v }))
  }

  function next(): void {
    if (isLast) close('submit')
    else setIndex((i) => i + 1)
  }

  function renderQuestion(q: Question): React.ReactElement {
    switch (q.type) {
      case 'rating': {
        const v = answers[q.id]
        return (
          <RatingQuestion
            question={q}
            value={typeof v === 'number' ? v : null}
            onChange={(n) => setAnswer(q.id, n)}
            theme={theme}
          />
        )
      }
      case 'nps': {
        const scoreVal = answers[q.id]
        const followUpKey = `${q.id}__followUp`
        const followUpVal = answers[followUpKey]
        return (
          <NpsQuestion
            question={q}
            score={typeof scoreVal === 'number' ? scoreVal : null}
            followUp={typeof followUpVal === 'string' ? followUpVal : ''}
            onScore={(n) => setAnswer(q.id, n)}
            onFollowUp={(s) => setAnswer(followUpKey, s)}
            theme={theme}
          />
        )
      }
      case 'multiple_choice': {
        const v = answers[q.id]
        const arr: ReadonlyArray<string> = Array.isArray(v) ? (v as ReadonlyArray<string>) : []
        return (
          <MultipleChoiceQuestion
            question={q}
            value={arr}
            onChange={(next2) => setAnswer(q.id, next2)}
            theme={theme}
          />
        )
      }
      case 'short_text': {
        const v = answers[q.id]
        return (
          <ShortTextQuestion
            question={q}
            value={typeof v === 'string' ? v : ''}
            onChange={(s) => setAnswer(q.id, s)}
            theme={theme}
          />
        )
      }
    }
  }

  const translateY = translate.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  })
  const opacity = translate.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })

  return (
    <Modal transparent visible={visible} onRequestClose={() => close('dismiss')} animationType="none">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close('dismiss')} accessibilityLabel="Dismiss" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radius,
              borderTopRightRadius: theme.radius,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          {current ? renderQuestion(current) : null}
          <View style={styles.actions}>
            <Pressable
              onPress={() => close('dismiss')}
              accessibilityRole="button"
              accessibilityLabel="Skip"
              style={styles.skip}
            >
              <Text style={{ color: theme.colors.subtext, fontFamily: theme.fontFamily }}>Skip</Text>
            </Pressable>
            <Pressable
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'Submit' : 'Next'}
              style={[styles.submit, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: theme.colors.background, fontWeight: '700', fontFamily: theme.fontFamily }}>
                {isLast ? 'Submit' : 'Next'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  skip: {
    padding: 12,
  },
  submit: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
  },
})
