// Full-screen multi-step survey renderer.
//
// Responsibilities:
//  - Render current question + navigation controls (Back, Next/Submit)
//  - Evaluate branching via sdk-core's `nextQuestionId`
//  - Persist progress to the server (debounced) and locally
//  - Render the end screen with optional CTA
//  - Emit lifecycle callbacks (onShow / onComplete / onAbandon)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  CONTENT_MAX_WIDTH,
  SurfaceBack,
  SurfaceClose,
  SurfaceHeader,
  SurfaceNext,
  SurfaceSecondary,
  useSurfaceLayout,
} from './SurfaceControls.js'
import type {
  SurveyAnswerRecord,
  SurveyAnswerValue,
  SurveyCampaignWithFlow,
  SurveyEndScreen,
  SurveyQuestion,
  SurveyAttemptSource,
} from '@usergist/sdk-core/mobile'
import { estimateProgress, nextQuestionId } from '@usergist/sdk-core/mobile'
import type { ResolvedTheme } from './theme.js'
import { DEFAULT_THEME, mergeTheme, surfaceTokens } from './theme.js'
import { SurfaceFieldFocus, useSurfaceFieldReveal } from './useSurfaceFieldReveal.js'
import { SurfaceModalFrame, type SurfaceModalLayout } from './SurfaceModalFrame.js'
import { RatingQuestion } from './questions/RatingQuestion.js'
import { NpsQuestion } from './questions/NpsQuestion.js'
import { ShortTextQuestion } from './questions/ShortTextQuestion.js'
import {
  InfoScreenView,
  LikertQuestionView,
  LongTextQuestionView,
  MultiChoiceQuestionView,
  RankingQuestionView,
  SingleChoiceQuestionView,
  SingleDateQuestionView,
} from './survey-questions.js'
import { useModalSlot } from '../internal/modal-coordinator.js'

export interface SurveyLifecycleCallbacks {
  readonly onShow?: (surveyId: string) => void
  readonly onComplete?: (surveyId: string, attemptId: string) => void
  readonly onAbandon?: (surveyId: string, attemptId: string) => void
}

export interface SurveyViewProps extends SurveyLifecycleCallbacks {
  readonly survey: SurveyCampaignWithFlow | null
  readonly attemptId: string | null
  readonly initialSnapshot: SurveyAnswerRecord
  readonly initialQuestionId: string | null
  readonly source: SurveyAttemptSource
  readonly themeOverride?: ResolvedTheme | null
  readonly onSaveProgress: (
    attemptId: string,
    currentQuestionId: string | null,
    snapshot: SurveyAnswerRecord,
  ) => Promise<void>
  readonly onCompleteAttempt: (
    attemptId: string,
    answers: ReadonlyArray<{ questionId: string; value: SurveyAnswerValue }>,
  ) => Promise<void>
  readonly onAbandonAttempt: (attemptId: string) => Promise<void>
  readonly onDismissRequest: () => void
}

export function SurveyView(props: SurveyViewProps): React.ReactElement | null {
  const fieldReveal = useSurfaceFieldReveal()
  const {
    survey,
    attemptId,
    initialSnapshot,
    initialQuestionId,
    themeOverride,
    onSaveProgress,
    onCompleteAttempt,
    onAbandonAttempt,
    onDismissRequest,
    onShow,
    onComplete,
    onAbandon,
  } = props

  const [answers, setAnswers] = useState<SurveyAnswerRecord>(initialSnapshot)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [history, setHistory] = useState<ReadonlyArray<string>>([])
  const [ended, setEnded] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalGranted = useModalSlot('survey', Boolean(survey))
  // Hooks must run in the same order while the Provider transitions this
  // component between its idle (survey=null) and visible states. Reading the
  // context below the early return caused React's development warning and can
  // corrupt later hook state on repeated opens.
  const hostLayout = useSurfaceLayout()
  const [modalLayout, setModalLayout] = useState<SurfaceModalLayout | null>(null)
  const layout = modalLayout ?? hostLayout

  const theme = useMemo<ResolvedTheme>(() => {
    // Priority: explicit per-app override > the survey's own theme
    // (saved from the dashboard DESIGN step) > SDK defaults.
    // Previously we ignored survey.theme entirely, so the dashboard
    // theme picker had no effect on device. Feedback's PromptSheet
    // already reads payload.theme — bring surveys to parity here.
    const surveyTheme = survey?.theme ?? undefined
    if (themeOverride) return mergeTheme(themeOverride, surveyTheme)
    return mergeTheme(DEFAULT_THEME, surveyTheme)
  }, [themeOverride, survey?.theme])

  useEffect(() => {
    if (survey) {
      const start = initialQuestionId ?? survey.flow.startQuestionId
      setCurrentId(start)
      setHistory([])
      setEnded(false)
      setSubmitError(null)
      setAnswers(initialSnapshot)
      if (onShow) onShow(survey.id)
    } else {
      setCurrentId(null)
    }
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [survey, attemptId, initialQuestionId, initialSnapshot, onShow])

  const scheduleSave = useCallback(
    (qid: string | null, snap: SurveyAnswerRecord) => {
      if (!attemptId) return
      // Persist before any debounce: backgrounding immediately after an
      // answer must retain the latest selection.
      void onSaveProgress(attemptId, qid, snap).catch(() => {
        setSubmitError('Your progress could not be saved. Please try again.')
      })
    },
    [attemptId, onSaveProgress],
  )

  // advance is a function declaration below; capture a ref so the
  // setAnswerFor callback can call the latest version without
  // listing it as a dep (which would loop).
  const advanceRef = useRef<(() => void) | null>(null)

  // Question-transition animation. Each time the active question
  // changes, the new question slides in from the right + fades up.
  // Native driver keeps the animation off the JS thread; on web the
  // transform / opacity drive a CSS animation through RN-web.
  const questionTranslate = useRef(new Animated.Value(0)).current
  const questionOpacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (ended) return
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
  }, [currentId, ended, questionTranslate, questionOpacity])

  // End-screen animation. Pop in with a tiny scale spring + fade.
  const endScale = useRef(new Animated.Value(0.6)).current
  const endOpacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!ended) return
    endScale.setValue(0.6)
    endOpacity.setValue(0)
    Animated.parallel([
      Animated.spring(endScale, {
        toValue: 1,
        tension: 70,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(endOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start()
  }, [ended, endScale, endOpacity])

  const setAnswerFor = useCallback(
    (qid: string, value: SurveyAnswerValue): void => {
      setAnswers((prev) => {
        const next = { ...prev, [qid]: value }
        scheduleSave(currentId, next)
        return next
      })
      // Auto-advance on tap-to-select types — there's nothing more
      // for the user to do, the Next button would just be friction.
      // multi_choice / text inputs still need explicit Next so the
      // user can pick multiple options or finish typing.
      if (qid !== currentId) return
      const q = survey?.flow.questions.find((x) => x.id === qid)
      const autoAdvance =
        q?.type === 'single_choice' ||
        q?.type === 'rating' ||
        q?.type === 'nps' ||
        q?.type === 'likert'
      if (autoAdvance) {
        // Tiny delay so the selection visibly locks in before the
        // next question slides over.
        setTimeout(() => advanceRef.current?.(), 220)
      }
    },
    [currentId, scheduleSave, survey?.flow.questions],
  )

  if (!survey) return null

  const surveyLocal = survey
  const flow = surveyLocal.flow
  const currentQuestion: SurveyQuestion | undefined = flow.questions.find(
    (q) => q.id === currentId,
  )

  function advance(): void {
    if (!currentQuestion) return
    if (currentQuestion.required && !isAnswered(answers[currentQuestion.id])) {
      return
    }
    const next = nextQuestionId(flow, currentQuestion.id, answers)
    if (!next) {
      void submitAndComplete()
      return
    }
    setHistory((h) => [...h, currentQuestion.id])
    setCurrentId(next)
    scheduleSave(next, answers)
  }
  advanceRef.current = advance

  // Answers are kept, so going back shows the previous choice for editing.
  function goBack(): void {
    const previous = history[history.length - 1]
    if (!flow.backNavigation || !previous || submitting) return
    setHistory((h) => h.slice(0, -1))
    setCurrentId(previous)
    scheduleSave(previous, answers)
  }

  async function submitAndComplete(): Promise<void> {
    if (!attemptId) return
    try {
      setSubmitting(true)
      setSubmitError(null)
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const payload: Array<{ questionId: string; value: SurveyAnswerValue }> = []
      for (const q of flow.questions) {
        if (q.type === 'info_screen') continue
        const v = answers[q.id]
        if (v === undefined) continue
        payload.push({ questionId: q.id, value: v })
      }
      await onCompleteAttempt(attemptId, payload)
      setEnded(true)
      if (onComplete) onComplete(surveyLocal.id, attemptId)
    } catch {
      setSubmitError('Your answers are saved on this device. Check your connection and retry.')
    } finally {
      setSubmitting(false)
    }
  }

  function dismiss(): void {
    if (ended) {
      onDismissRequest()
      return
    }
    // Close the modal IMMEDIATELY so the user always gets feedback on
    // their X tap. Server-side abandon goes out fire-and-forget; the
    // attempt sweeper will mark it abandoned anyway if the request
    // never lands. Awaiting abandon here meant 5s of "stuck" UI on a
    // flaky server, and retry storms from repeated X-taps.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (attemptId) {
      const id = attemptId
      void (async () => {
        try {
          await onAbandonAttempt(id)
          if (onAbandon) onAbandon(surveyLocal.id, id)
        } catch {
          // ignore — server sweeper catches stragglers.
        }
      })()
    }
    onDismissRequest()
  }

  const progress = estimateProgress(flow, currentId)
  const needsNext = !ended && currentQuestion && (isTextInput(currentQuestion.type) || renderFooter(currentQuestion.type))
  const nextDisabled = Boolean(currentQuestion &&
    (isTextInput(currentQuestion.type) || currentQuestion.required === true) && !isAnswered(answers[currentQuestion.id]))
  const landscape = layout.landscape
  const isFinal = Boolean(currentQuestion && !nextQuestionId(flow, currentQuestion.id, answers))
  const nextAction = <SurfaceNext onPress={advance} disabled={nextDisabled} loading={submitting}
    compact={landscape} theme={theme} testID="survey-next" label={isFinal ? 'Submit' : 'Next'} />
  const canGoBack = flow.backNavigation && history.length > 0 && !ended && !submitting
  const closeAction = <SurfaceClose onPress={dismiss} color={theme.colors.text}
    size={landscape ? 'regular' : 'small'} testID="survey-close" />
  const backAction = canGoBack
    ? <SurfaceBack onPress={goBack} color={theme.colors.text} size={landscape ? 'regular' : 'small'} testID="survey-back" />
    : null
  const stepIndex = flow.questions.findIndex((x) => x.id === currentId)
  const progressView = ended ? null : flow.progressStyle === 'bar' ? (
    <View style={[styles.progressTrack, { backgroundColor: surfaceTokens(theme).fillStrong }]}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <View style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: `${Math.round(progress * 100)}%` }]} />
    </View>
  ) : flow.progressStyle === 'dots' ? (
    <View style={styles.dotsRow}>
      {flow.questions.map((q, i) => (
        <View key={q.id} style={[styles.dot, i === stepIndex && styles.dotActive, {
          backgroundColor: i <= stepIndex ? theme.colors.primary : surfaceTokens(theme).fillStrong,
        }]} />
      ))}
    </View>
  ) : null
  const showFooter = !ended && needsNext
  const endCta = ended ? (
    <EndAction screen={surveyLocal.endScreen} theme={theme} compact={landscape} onClose={onDismissRequest} />
  ) : null

  return (
    <Modal
      visible={modalGranted}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={() => dismiss()}
    >
      <SurfaceModalFrame onChange={setModalLayout}>
      <View style={[styles.root, { backgroundColor: theme.colors.background, paddingLeft: layout.left, paddingRight: layout.right }]}>
        {/* Keep actions inside the live safe area in either orientation. */}
        <View style={[styles.header, landscape && styles.landscapeHeader, { paddingTop: layout.top + (landscape ? 8 : 4) }]}>
          <SurfaceHeader
            balancedSides={landscape && !ended}
            leading={landscape ? <>{closeAction}{backAction}</> : backAction ?? closeAction}
            center={<View style={styles.progressWrap}>{progressView}</View>}
            trailing={<>
              {!landscape && canGoBack ? closeAction : null}
              {landscape ? (ended ? endCta : needsNext ? nextAction : null) : null}
            </>}
          />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView ref={fieldReveal.scrollRef} onLayout={fieldReveal.reveal} contentContainerStyle={[styles.body, landscape && styles.landscapeBody, ended && styles.endBody]}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <SurfaceFieldFocus.Provider value={fieldReveal.onFocus}>
            <View ref={fieldReveal.contentRef} collapsable={false} onLayout={fieldReveal.onContentLayout} style={styles.measure}>
            {ended ? (
              <Animated.View
                style={{
                  opacity: endOpacity,
                  transform: [{ scale: endScale }],
                }}
              >
                <EndScreen screen={surveyLocal.endScreen} theme={theme} />
              </Animated.View>
            ) : currentQuestion ? (
              <Animated.View
                style={{
                  opacity: questionOpacity,
                  transform: [{ translateX: questionTranslate }],
                }}
              >
                {renderQuestion(currentQuestion, answers, setAnswerFor, theme)}
                {submitError ? (
                  <View accessibilityRole="alert" style={[styles.submitError, {
                    backgroundColor: surfaceTokens(theme).fill,
                    borderRadius: Math.min(theme.radius, 14),
                  }]}>
                    <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
                      {submitError}
                    </Text>
                    <SurfaceSecondary onPress={() => { void submitAndComplete() }} theme={theme}
                      label="Try again" compact testID="survey-retry" />
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <ActivityIndicator color={theme.colors.primary} />
            )}
            </View>
            </SurfaceFieldFocus.Provider>
          </ScrollView>

          {!landscape && showFooter ? (
            // Lift actions above the home indicator / gesture bar.
            <View style={[styles.footer, { paddingBottom: Math.max(layout.bottom, 16) }]}>
              <View style={styles.footerMain}>{needsNext ? nextAction : null}</View>
            </View>
          ) : null}
          {!landscape && ended ? (
            <View style={[styles.footer, { paddingBottom: Math.max(layout.bottom, 16) }]}>
              <View style={styles.footerMain}>{endCta}</View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
      </SurfaceModalFrame>
    </Modal>
  )
}

// Tap-to-select types auto-advance. Text and the types listed below
// use a portrait footer or the landscape header action.
function renderFooter(type: SurveyQuestion['type'] | undefined): boolean {
  if (!type) return false
  return (
    type === 'multi_choice' ||
    type === 'ranking' ||
    type === 'single_date' ||
    type === 'info_screen'
  )
}

function isTextInput(type: SurveyQuestion['type'] | undefined): boolean {
  return type === 'short_text' || type === 'long_text'
}

function isAnswered(v: SurveyAnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

function renderQuestion(
  q: SurveyQuestion,
  answers: SurveyAnswerRecord,
  setAnswer: (qid: string, v: SurveyAnswerValue) => void,
  theme: ResolvedTheme,
): React.ReactElement | null {
  const current = answers[q.id]
  switch (q.type) {
    case 'single_choice':
      return (
        <SingleChoiceQuestionView
          question={q}
          value={typeof current === 'string' ? current : null}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'multi_choice':
      return (
        <MultiChoiceQuestionView
          question={q}
          value={Array.isArray(current) ? (current as ReadonlyArray<string>) : []}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'nps':
      return (
        <NpsQuestion
          question={{ id: q.id, type: 'nps', title: q.title, subtitle: q.subtitle }}
          score={typeof current === 'number' ? current : null}
          followUp={''}
          onScore={(v) => setAnswer(q.id, v)}
          onFollowUp={() => {
            // NPS follow-up is represented as its own question in surveys (via branching).
          }}
          theme={theme}
        />
      )
    case 'rating':
      return (
        <RatingQuestion
          question={{
            id: q.id,
            type: 'rating',
            title: q.title,
            subtitle: q.subtitle,
            scale: q.scale,
            lowLabel: q.lowLabel,
            highLabel: q.highLabel,
          }}
          value={typeof current === 'number' ? current : null}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'likert':
      return (
        <LikertQuestionView
          question={q}
          value={typeof current === 'number' ? current : null}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'short_text':
      return (
        <ShortTextQuestion
          question={{
            id: q.id,
            type: 'short_text',
            title: q.title,
            subtitle: q.subtitle,
            placeholder: q.placeholder,
          }}
          value={typeof current === 'string' ? current : ''}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'long_text':
      return (
        <LongTextQuestionView
          question={q}
          value={typeof current === 'string' ? current : ''}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'ranking':
      return (
        <RankingQuestionView
          question={q}
          value={Array.isArray(current) ? (current as ReadonlyArray<string>) : []}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'single_date':
      return (
        <SingleDateQuestionView
          question={q}
          value={typeof current === 'string' ? current : ''}
          onChange={(v) => setAnswer(q.id, v)}
          theme={theme}
        />
      )
    case 'info_screen':
      return <InfoScreenView question={q} theme={theme} />
    // Unknown/newer question type: render nothing rather than returning
    // undefined, which throws a React render error and crashes the host app.
    default:
      return null
  }
}

function EndScreen({
  screen,
  theme,
}: {
  readonly screen: SurveyEndScreen | null
  readonly theme: ResolvedTheme
}): React.ReactElement {
  const headline = screen?.headline ?? 'Thanks!'
  const body = screen?.body
  const tokens = surfaceTokens(theme)
  return (
    <View style={styles.endRoot}>
      <View style={[styles.endBadge, { backgroundColor: tokens.tint }]}>
        <View style={[styles.endTick, { borderColor: theme.colors.primary }]} />
      </View>
      <Text accessibilityRole="header"
        style={[styles.endHeadline, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
        {headline}
      </Text>
      {body ? (
        <Text style={[styles.endText, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {body}
        </Text>
      ) : null}
    </View>
  )
}

function EndAction({
  screen,
  theme,
  compact,
  onClose,
}: {
  readonly screen: SurveyEndScreen | null
  readonly theme: ResolvedTheme
  readonly compact: boolean
  readonly onClose: () => void
}): React.ReactElement {
  const cta = screen?.cta
  function onPressCta(): void {
    if (!cta) {
      onClose()
      return
    }
    if (cta.kind === 'close') {
      onClose()
      return
    }
    if (cta.target) {
      void Linking.openURL(cta.target).catch(() => undefined)
    }
    onClose()
  }
  return (
    <SurfaceNext onPress={onPressCta} disabled={false} compact={compact} theme={theme}
      testID="survey-complete-close" label={cta?.label ?? 'Done'} />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  submitError: { marginTop: 20, padding: 16, gap: 12 },
  errorText: { fontSize: 15, lineHeight: 21 },
  header: { paddingHorizontal: 12, paddingBottom: 4 },
  // Match the body's 24pt inset and 560pt readable measure, including when
  // the safe area leaves less than the maximum width on a smaller phone.
  landscapeHeader: { width: '100%', maxWidth: CONTENT_MAX_WIDTH + 48, alignSelf: 'center', paddingHorizontal: 24 },
  progressWrap: { width: '100%', maxWidth: 320, alignItems: 'center', paddingHorizontal: 8 },
  progressTrack: { height: 6, width: '100%', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  dotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },
  body: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, flexGrow: 1 },
  landscapeBody: { paddingTop: 8, paddingBottom: 24 },
  endBody: { justifyContent: 'center' },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  footer: { width: '100%', maxWidth: CONTENT_MAX_WIDTH + 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  footerMain: { flex: 1 },
  endRoot: { alignItems: 'center', paddingVertical: 24 },
  endBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  endTick: { width: 26, height: 14, borderLeftWidth: 3.5, borderBottomWidth: 3.5, transform: [{ rotate: '-45deg' }], marginTop: -6 },
  endHeadline: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  endText: { fontSize: 16, marginTop: 10, lineHeight: 24, textAlign: 'center', maxWidth: 420 },
})
