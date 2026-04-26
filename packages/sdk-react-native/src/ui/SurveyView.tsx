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
import type {
  SurveyAnswerRecord,
  SurveyAnswerValue,
  SurveyCampaignWithFlow,
  SurveyEndScreen,
  SurveyQuestion,
  SurveyAttemptSource,
} from '@ritmus/sdk-core'
import { estimateProgress, nextQuestionId } from '@ritmus/sdk-core'
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
    if (themeOverride) return mergeTheme(themeOverride, undefined)
    return mergeTheme(DEFAULT_THEME, undefined)
  }, [themeOverride])

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

  const setAnswerFor = useCallback(
    (qid: string, value: SurveyAnswerValue): void => {
      setAnswers((prev) => {
        const next = { ...prev, [qid]: value }
        scheduleSave(currentId, next)
        return next
      })
    },
    [currentId, scheduleSave],
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

  function goBack(): void {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setCurrentId(prev)
    scheduleSave(prev, answers)
  }

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

  async function dismiss(): Promise<void> {
    if (attemptId) {
      try {
        await onAbandonAttempt(attemptId)
        if (onAbandon) onAbandon(surveyLocal.id, attemptId)
      } catch {
        // ignore — the server sweeper will catch stragglers.
      }
    }
    onDismissRequest()
  }

  const progress = estimateProgress(flow, currentId)
  const isFirst = history.length === 0
  const backEnabled = flow.backNavigation && !isFirst
  const isLastPossible =
    currentQuestion != null && nextQuestionId(flow, currentQuestion.id, answers) === null

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => void dismiss()}
    >
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => void dismiss()} accessibilityLabel="Close" hitSlop={16}>
            <Text style={{ color: theme.colors.subtext, fontFamily: theme.fontFamily, fontSize: 16 }}>
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
              <EndScreen
                screen={surveyLocal.endScreen}
                theme={theme}
                onClose={onDismissRequest}
              />
            ) : currentQuestion ? (
              renderQuestion(currentQuestion, answers, setAnswerFor, theme)
            ) : (
              <ActivityIndicator />
            )}
          </ScrollView>

          {!ended ? (
            <View style={styles.footer}>
              <Pressable
                onPress={goBack}
                disabled={!backEnabled}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={styles.back}
              >
                <Text
                  style={{
                    color: backEnabled ? theme.colors.primary : theme.colors.subtext,
                    fontFamily: theme.fontFamily,
                    fontSize: 16,
                  }}
                >
                  Back
                </Text>
              </Pressable>
              <Pressable
                onPress={advance}
                disabled={
                  submitting ||
                  (currentQuestion?.required === true &&
                    !isAnswered(answers[currentQuestion.id]))
                }
                accessibilityRole="button"
                accessibilityLabel={isLastPossible ? 'Submit' : 'Next'}
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
                <Text
                  style={{
                    color: theme.colors.background,
                    fontFamily: theme.fontFamily,
                    fontWeight: '700',
                  }}
                >
                  {submitting ? '…' : isLastPossible ? 'Submit' : 'Next'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
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
    <View>
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
            color: theme.colors.background,
            fontFamily: theme.fontFamily,
            fontWeight: '700',
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
  progressWrap: { flex: 1 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  body: { padding: 20, paddingBottom: 40 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  back: { paddingVertical: 12, paddingHorizontal: 8 },
  next: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    minWidth: 140,
    alignItems: 'center',
  },
  endHeadline: { fontSize: 24, fontWeight: '700' },
  endBody: { fontSize: 16, marginTop: 12, lineHeight: 24 },
  cta: {
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
})
