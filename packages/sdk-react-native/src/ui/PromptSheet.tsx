// Bottom-sheet modal that renders an armed prompt and collects answers.
//
// Supports rating, NPS, multiple_choice, short_text. Questions are shown
// one at a time. Explicit actions stay outside the scrolling question:
// a full-width keyboard-safe footer in either orientation. No Back button.
// Mirrors the SurveyView rules so feedback and surveys feel identical.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { CONTENT_MAX_WIDTH, SurfaceClose, SurfaceHeader, SurfaceNext, useSurfaceLayout } from './SurfaceControls.js'
import { SurfaceFieldFocus, useSurfaceFieldReveal } from './useSurfaceFieldReveal.js'
import { SurfaceModalFrame, type SurfaceModalLayout } from './SurfaceModalFrame.js'
import type { Question } from '@usergist/sdk-core/mobile'
import type { ShowPromptPayload, ResponseEmission } from '../internal/types.js'
import { DEFAULT_THEME, mergeTheme, surfaceTokens, type ResolvedTheme } from './theme.js'
import { animateIn, animateOut } from './animations.js'
import { RatingQuestion } from './questions/RatingQuestion.js'
import { NpsQuestion } from './questions/NpsQuestion.js'
import { MultipleChoiceQuestion } from './questions/MultipleChoiceQuestion.js'
import { ShortTextQuestion } from './questions/ShortTextQuestion.js'
import { useModalSlot } from '../internal/modal-coordinator.js'
import {
  promptResponseAnswers,
  withPromptAnswer,
  type PromptAnswerRecord,
  type PromptAnswerValue,
} from '../internal/prompt-answers.js'
import {
  promptNeedsExplicitNext,
  promptNextRequiresAnswer,
  promptShouldAutoAdvance,
} from '../internal/prompt-flow.js'

type AnswerRecord = PromptAnswerRecord

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
  const fieldReveal = useSurfaceFieldReveal()
  const [visible, setVisible] = useState<boolean>(false)
  const [index, setIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<AnswerRecord>({})
  const answersRef = useRef<AnswerRecord>({})
  const closingRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalGranted = useModalSlot('prompt', Boolean(payload))
  const translate = useRef(new Animated.Value(0)).current
  const hostLayout = useSurfaceLayout()
  const [modalLayout, setModalLayout] = useState<SurfaceModalLayout | null>(null)
  const layout = modalLayout ?? hostLayout
  const { height, landscape } = layout

  const theme: ResolvedTheme = useMemo(() => {
    if (themeOverride) return mergeTheme(themeOverride, payload?.theme)
    return mergeTheme(DEFAULT_THEME, payload?.theme)
  }, [themeOverride, payload?.theme])

  useEffect(() => {
    if (payload) {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
      answersRef.current = {}
      closingRef.current = false
      setAnswers({})
      setIndex(0)
      setVisible(true)
      requestAnimationFrame(() => animateIn(translate))
    }
  }, [payload, translate])

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
  }, [])

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
    if (closingRef.current) return
    closingRef.current = true
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = null
    animateOut(translate, () => {
      setVisible(false)
      const latencyMs = Date.now() - (payload?.shownAt ?? Date.now())
      const result: ResponseEmission = {
        promptId: payload!.promptId,
        answers: promptResponseAnswers(answersRef.current),
        dismissed: kind === 'dismiss',
        latencyMs,
      }
      if (kind === 'submit') onSubmit(result)
      else onDismiss(result)
    })
  }

  function setAnswer(qid: string, v: PromptAnswerValue): void {
    const nextAnswers = withPromptAnswer(answersRef.current, qid, v)
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)
    // Auto-advance for tap-to-select question types — same UX rule
    // as the survey shell. multi_choice + text inputs keep the
    // explicit Next button so the user can pick multiple options
    // or finish typing.
    if (current?.id === qid && promptShouldAutoAdvance(current)) {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null
        next()
      }, 220)
    }
  }

  function next(): void {
    if (isLast) close('submit')
    else setIndex((i) => i + 1)
  }

  function renderQuestion(q: Question): React.ReactElement | null {
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
      // Unknown/newer question type (e.g. served by a newer dashboard to an
      // older SDK). Render nothing instead of returning undefined, which would
      // throw a React render error and unmount the host app tree.
      default:
        return null
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

  const needsNext = current && promptNeedsExplicitNext(current)
  const nextDisabled = Boolean(current && promptNextRequiresAnswer(current) && !answerHasValue(answers[current.id]))
  const nextLabel = isLast ? 'Submit' : 'Next'
  const nextAction = <SurfaceNext onPress={next} disabled={nextDisabled} theme={theme}
    testID="feedback-next" label={nextLabel} />
  const closeAction = <SurfaceClose onPress={() => close('dismiss')} color={theme.colors.text} testID="feedback-close" />
  const step = questions.length > 1 ? (
    <Text style={[styles.step, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
      {index + 1} of {questions.length}
    </Text>
  ) : null
  // A bottom sheet always spans the full screen width. The header sits at the
  // safe-area edges with Close leading. The question and full-width action
  // footer share one centred readable column in either orientation.

  return (
    <Modal transparent visible={visible && modalGranted} onRequestClose={() => close('dismiss')} animationType="none"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
      <SurfaceModalFrame onChange={setModalLayout}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingTop: layout.top + (landscape ? 12 : 16) }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: surfaceTokens(theme).scrim, opacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close('dismiss')} accessibilityLabel="Dismiss" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radius,
              borderTopRightRadius: theme.radius,
              paddingBottom: landscape ? Math.max(layout.bottom, 12) : Math.max(layout.bottom, 16),
              paddingLeft: layout.left + 12,
              paddingRight: layout.right + 12,
              transform: [{ translateY }],
            },
          ]}
        >
          <SurfaceHeader leading={closeAction} center={step} />
          <View style={styles.measure}>
          <ScrollView ref={fieldReveal.scrollRef} onLayout={fieldReveal.reveal} style={styles.scroll} contentContainerStyle={styles.questionContent}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
          <SurfaceFieldFocus.Provider value={fieldReveal.onFocus}>
          <View ref={fieldReveal.contentRef} collapsable={false} onLayout={fieldReveal.onContentLayout}>
          {current ? (
            <Animated.View
              style={{
                opacity: questionOpacity,
                transform: [{ translateX: questionTranslate }],
              }}
            >
              {renderQuestion(current)}
            </Animated.View>
          ) : null}
          </View>
          </SurfaceFieldFocus.Provider>
          </ScrollView>
          {needsNext ? <View style={styles.footer}>{nextAction}</View> : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
      </SurfaceModalFrame>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    paddingTop: 8,
  },
  // Question and footer share one readable column inside the full-width sheet.
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', flexShrink: 1 },
  step: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  scroll: { flexShrink: 1 },
  questionContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 20 },
  footer: { paddingHorizontal: 12, paddingTop: 4 },
})
