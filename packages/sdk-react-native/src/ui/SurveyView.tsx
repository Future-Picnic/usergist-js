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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  SurveyAnswerRecord,
  SurveyAnswerValue,
  SurveyCampaignWithFlow,
  SurveyEndScreen,
  SurveyQuestion,
  SurveyAttemptSource,
} from '@usergist/sdk-core'
import { estimateProgress, nextQuestionId } from '@usergist/sdk-core'
import type { ResolvedTheme } from './theme.js'
import { DEFAULT_THEME, mergeTheme } from './theme.js'
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
  readonly onSubmitAnswers: (
    attemptId: string,
    answers: ReadonlyArray<{ questionId: string; value: SurveyAnswerValue }>,
  ) => Promise<void>
  readonly onCompleteAttempt: (attemptId: string) => Promise<void>
  readonly onAbandonAttempt: (attemptId: string) => Promise<void>
  readonly onDismissRequest: () => void
}

export function SurveyView(props: SurveyViewProps): React.ReactElement | null {
  const {
    survey,
    attemptId,
    initialSnapshot,
    initialQuestionId,
    themeOverride,
    onSaveProgress,
    onSubmitAnswers,
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setAnswers(initialSnapshot)
      if (onShow) onShow(survey.id)
    } else {
      setCurrentId(null)
    }
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [survey, initialQuestionId, initialSnapshot, onShow])

  const scheduleSave = useCallback(
    (qid: string | null, snap: SurveyAnswerRecord) => {
      if (!attemptId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void onSaveProgress(attemptId, qid, snap)
      }, 600)
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

  async function submitAndComplete(): Promise<void> {
    if (!attemptId) return
    try {
      setSubmitting(true)
      const payload: Array<{ questionId: string; value: SurveyAnswerValue }> = []
      for (const q of flow.questions) {
        if (q.type === 'info_screen') continue
        const v = answers[q.id]
        if (v === undefined) continue
        payload.push({ questionId: q.id, value: v })
      }
      if (payload.length > 0) {
        await onSubmitAnswers(attemptId, payload)
      }
      await onCompleteAttempt(attemptId)
      setEnded(true)
      if (onComplete) onComplete(surveyLocal.id, attemptId)
    } finally {
      setSubmitting(false)
    }
  }

  function dismiss(): void {
    // Close the modal IMMEDIATELY so the user always gets feedback on
    // their X tap. Server-side abandon goes out fire-and-forget; the
    // attempt sweeper will mark it abandoned anyway if the request
    // never lands. Awaiting abandon here meant 5s of "stuck" UI on a
    // flaky server, and retry storms from repeated X-taps.
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
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => dismiss()}
    >
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <View
          style={[
            styles.header,
            // Push the close X + progress bar below the iPhone notch /
            // status bar / Android nav bar. iOS Modal sometimes hands
            // back insets.top = 0 inside the modal context, so we
            // hard-floor the padding to a value that clears the
            // iPhone status bar regardless.
            {
              paddingTop: Math.max(
                insets.top,
                Platform.OS === 'ios' ? 50 : 24,
              ),
            },
          ]}
        >
          <Pressable
            onPress={() => dismiss()}
            accessibilityLabel="Close"
            hitSlop={16}
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
          <View style={styles.progressWrap}>
            {flow.progressStyle === 'bar' ? (
              <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: theme.colors.primary, width: `${Math.round(progress * 100)}%` },
                  ]}
                />
              </View>
            ) : flow.progressStyle === 'dots' ? (
              <View style={styles.dotsRow}>
                {flow.questions.map((q, i) => (
                  <View
                    key={q.id}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i <= flow.questions.findIndex((x) => x.id === currentId)
                            ? theme.colors.primary
                            : theme.colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
          <View style={{ width: 24 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.body}>
            {ended ? (
              <Animated.View
                style={{
                  opacity: endOpacity,
                  transform: [{ scale: endScale }],
                }}
              >
                <EndScreen
                  screen={surveyLocal.endScreen}
                  theme={theme}
                  onClose={onDismissRequest}
                />
              </Animated.View>
            ) : currentQuestion ? (
              <Animated.View
                style={{
                  opacity: questionOpacity,
                  transform: [{ translateX: questionTranslate }],
                }}
              >
                {renderQuestion(currentQuestion, answers, setAnswerFor, theme)}
                {isTextInput(currentQuestion.type) ? (
                  <Pressable
                    onPress={advance}
                    disabled={
                      submitting || !isAnswered(answers[currentQuestion.id])
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Next"
                    style={[
                      styles.inlineNext,
                      {
                        backgroundColor: theme.colors.primary,
                        opacity: isAnswered(answers[currentQuestion.id]) ? 1 : 0.4,
                      },
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text
                        style={{
                          color: '#ffffff',
                          fontFamily: theme.fontFamily,
                          fontWeight: '700',
                        }}
                      >
                        Next
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </Animated.View>
            ) : (
              <ActivityIndicator />
            )}
          </ScrollView>

          {!ended && renderFooter(currentQuestion?.type) ? (
            <View
              style={[
                styles.footer,
                // Lift the Next button above the iPhone home indicator
                // (and any Android nav gesture bar) so it stays tappable.
                { paddingBottom: Math.max(insets.bottom, 16) },
              ]}
            >
              <Pressable
                onPress={advance}
                disabled={
                  submitting ||
                  (currentQuestion?.required === true &&
                    !isAnswered(answers[currentQuestion.id]))
                }
                accessibilityRole="button"
                accessibilityLabel="Next"
                style={[
                  styles.next,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity:
                      currentQuestion?.required === true &&
                      !isAnswered(answers[currentQuestion.id])
                        ? 0.4
                        : 1,
                  },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.background} />
                ) : (
                  <Text
                    style={{
                      color: theme.colors.background,
                      fontFamily: theme.fontFamily,
                      fontWeight: '700',
                    }}
                  >
                    Next
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// Tap-to-select question types auto-advance — they don't need a
// Next button. Text inputs render their OWN inline Next button right
// under the field (see body block below), so they don't need the
// global footer either. multi_choice / ranking / single_date /
// info_screen keep the bottom footer.
function renderFooter(type: SurveyQuestion['type'] | undefined): boolean {
  if (!type) return true
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
): React.ReactElement {
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
  }
}

function EndScreen({
  screen,
  theme,
  onClose,
}: {
  readonly screen: SurveyEndScreen | null
  readonly theme: ResolvedTheme
  readonly onClose: () => void
}): React.ReactElement {
  const headline = screen?.headline ?? 'Thanks!'
  const body = screen?.body
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
    <View style={styles.endRoot}>
      <View
        style={[
          styles.endBadge,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <Text style={styles.endBadgeGlyph}>✓</Text>
      </View>
      <Text
        style={[styles.endHeadline, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
      >
        {headline}
      </Text>
      {body ? (
        <Text
          style={[styles.endBody, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}
        >
          {body}
        </Text>
      ) : null}
      <Pressable
        onPress={onPressCta}
        style={[styles.cta, { backgroundColor: theme.colors.primary }]}
      >
        <Text
          style={{
            // Hardcoded white because theme.colors.background tends to
            // be a light tint of primary (e.g. Candy: pink primary,
            // light-pink background) — using it for button text on a
            // primary-colored fill makes the label invisible.
            color: '#ffffff',
            fontFamily: theme.fontFamily,
            fontWeight: '700',
            fontSize: 16,
          }}
        >
          {cta?.label ?? 'Close'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrap: { flex: 1 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  body: { padding: 20, paddingTop: 28, paddingBottom: 40 },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  inlineNext: {
    alignSelf: 'stretch',
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  next: {
    alignSelf: 'stretch',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  endRoot: { alignItems: 'center', paddingVertical: 24 },
  endBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  endBadgeGlyph: {
    color: '#ffffff',
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '700',
  },
  endHeadline: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  endBody: { fontSize: 16, marginTop: 12, lineHeight: 24, textAlign: 'center' },
  cta: {
    alignSelf: 'stretch',
    marginTop: 32,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
})
