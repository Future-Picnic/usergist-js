// Bottom-sheet modal that renders an armed prompt and collects answers.
//
// Supports rating, NPS, multiple_choice, short_text. Questions are shown
// one at a time. Tap-to-select types auto-advance; text inputs render
// an inline full-width Next button under the field. The X close at the
// top-right is the only dismiss path. There's no Back button anywhere.
// Mirrors the SurveyView rules so feedback and surveys feel identical.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Question } from '@ritmus/sdk-core'
import type { ShowPromptPayload, ResponseEmission } from '../internal/types.js'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from './theme.js'
import { animateIn, animateOut } from './animations.js'
import { RatingQuestion } from './questions/RatingQuestion.js'
import { NpsQuestion } from './questions/NpsQuestion.js'
import { MultipleChoiceQuestion } from './questions/MultipleChoiceQuestion.js'
import { ShortTextQuestion } from './questions/ShortTextQuestion.js'

type AnswerRecord = Record<string, number | string | ReadonlyArray<string> | null>

// Tap-to-select questions auto-advance — there's nothing more for
// the user to do, the Next button would just be friction.
//   - rating / nps: always auto-advance
//   - multiple_choice: auto-advance only when it's single-select
//     (multiSelect=false). When the prompt allows multiple picks the
//     user needs the explicit Next button to commit their choices.
function shouldAutoAdvance(q: Question): boolean {
  if (q.type === 'rating' || q.type === 'nps') return true
  if (q.type === 'multiple_choice') return !q.multiSelect
  return false
}

// Text inputs render their OWN inline Next button under the field
// (full-width, disabled until the user types something).
function isTextInput(type: Question['type']): boolean {
  return type === 'short_text'
}

function answerHasValue(v: number | string | ReadonlyArray<string> | null | undefined): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

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
  const insets = useSafeAreaInsets()

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

  // Slide each new question in from the right + fade up. Same
  // pattern surveys use, so feedback and survey feel identical.
  const questionTranslate = useRef(new Animated.Value(0)).current
  const questionOpacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    questionTranslate.setValue(36)
    questionOpacity.setValue(0)
    Animated.parallel([
      Animated.timing(questionTranslate, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(questionOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [index, questionTranslate, questionOpacity])

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
    // Auto-advance for tap-to-select question types — same UX rule
    // as the survey shell. multi_choice + text inputs keep the
    // explicit Next button so the user can pick multiple options
    // or finish typing.
    if (current?.id === qid && shouldAutoAdvance(current)) {
      setTimeout(() => next(), 220)
    }
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
              paddingBottom: Math.max(insets.bottom, 30) + 16,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
            <Pressable
              onPress={() => close('dismiss')}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily,
                  fontSize: 14,
                  fontWeight: '600',
                  lineHeight: 18,
                }}
              >
                ✕
              </Text>
            </Pressable>
          </View>
          {current ? (
            <Animated.View
              style={{
                opacity: questionOpacity,
                transform: [{ translateX: questionTranslate }],
              }}
            >
              {renderQuestion(current)}
              {/* Text inputs: full-width inline Next directly under
                  the field, disabled until the user types. */}
              {isTextInput(current.type) ? (
                <Pressable
                  onPress={next}
                  disabled={!answerHasValue(answers[current.id])}
                  accessibilityRole="button"
                  accessibilityLabel="Next"
                  style={[
                    styles.next,
                    {
                      backgroundColor: theme.colors.primary,
                      opacity: answerHasValue(answers[current.id]) ? 1 : 0.4,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: '#ffffff',
                      fontWeight: '700',
                      fontFamily: theme.fontFamily,
                      fontSize: 16,
                    }}
                  >
                    Next
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}
          {/* Footer Next for non-text, non-auto-advance types
              (multi_choice). Full-width pill, no Back. */}
          {current && !shouldAutoAdvance(current) && !isTextInput(current.type) ? (
            <Pressable
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel="Next"
              style={[styles.next, { backgroundColor: theme.colors.primary }]}
            >
              <Text
                style={{
                  color: '#ffffff',
                  fontWeight: '700',
                  fontFamily: theme.fontFamily,
                  fontSize: 16,
                }}
              >
                Next
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Sit somewhere between "tiny single-question pill" and "fills
    // half the screen". 280pt gives the title + answers + endpoint
    // labels a comfortable amount of vertical breathing room without
    // pushing them too far up the device. paddingTop reserves space
    // above the drag handle / X close so neither hugs the rounded
    // top edge of the sheet.
    minHeight: 280,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    // Position the close button absolutely so the drag handle stays
    // perfectly centred regardless of the X's width. The bottom
    // margin pushes the question title down so it doesn't crowd the
    // X — gives the eye a clear separation between the dismiss
    // affordance and the actual content.
    position: 'relative',
    height: 32,
    marginBottom: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 6,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    // Subtle gray pill behind the X — gives the dismiss target a
    // visual affordance without competing with the primary action.
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  next: {
    alignSelf: 'stretch',
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
})
