// Pure-presentational survey renderer used by the dashboard composer's
// live preview. Same JSX shape as SurveyView (header + body + footer)
// minus the runtime concerns: no Modal wrapper, no attempt lifecycle,
// no server save / submit. The dashboard renders this via
// react-native-web inside an iPhone PhoneFrame so what designers see
// is exactly what the SDK ships.
//
// Keep this file dependency-free of the engine: only react-native
// primitives + sdk-core types + theme helpers + question renderers.

import React, { useMemo } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type {
  PromptTheme,
  SurveyAnswerRecord,
  SurveyAnswerValue,
  SurveyCampaignWithFlow,
  SurveyEndScreen,
  SurveyQuestion,
} from '@usergist/sdk-core/mobile'
import { estimateProgress, nextQuestionId } from '@usergist/sdk-core/mobile'
import { DEFAULT_THEME, mergeTheme, surfaceTokens, type ResolvedTheme } from '../ui/theme.js'
import { CONTENT_MAX_WIDTH, SurfaceBack, SurfaceClose, SurfaceHeader, SurfaceNext } from '../ui/SurfaceControls.js'
import { RatingQuestion } from '../ui/questions/RatingQuestion.js'
import { NpsQuestion } from '../ui/questions/NpsQuestion.js'
import { ShortTextQuestion } from '../ui/questions/ShortTextQuestion.js'
import {
  InfoScreenView,
  LikertQuestionView,
  LongTextQuestionView,
  MultiChoiceQuestionView,
  RankingQuestionView,
  SingleChoiceQuestionView,
  SingleDateQuestionView,
} from '../ui/survey-questions.js'

export interface SurveyShellProps {
  readonly survey: SurveyCampaignWithFlow
  readonly theme?: PromptTheme | null
  // The question to render. Defaults to the survey's startQuestionId.
  readonly currentQuestionId?: string | null
  // Optional answer record for showing in-progress state in the
  // preview. Mostly the dashboard passes empty answers.
  readonly answers?: SurveyAnswerRecord
  readonly onAnswerChange?: (qid: string, value: SurveyAnswerValue) => void
  // No-op handlers by default — preview is static unless the host
  // wires interactivity.
  readonly onAdvance?: () => void
  readonly onBack?: () => void
  readonly onClose?: () => void
  // Renders the end screen instead of a question. Useful for the
  // composer's "view end screen" toggle.
  readonly showEndScreen?: boolean
}

const NOOP = (): void => undefined

export function SurveyShell({
  survey,
  theme,
  currentQuestionId,
  answers = {},
  onAnswerChange = NOOP,
  onAdvance = NOOP,
  onBack = NOOP,
  onClose = NOOP,
  showEndScreen = false,
}: SurveyShellProps): React.ReactElement {
  const resolvedTheme = useMemo<ResolvedTheme>(
    () => mergeTheme(DEFAULT_THEME, theme ?? undefined),
    [theme],
  )
  const flow = survey.flow
  const activeId = currentQuestionId ?? flow.startQuestionId
  const currentQuestion = flow.questions.find((q) => q.id === activeId)
  const progress = estimateProgress(flow, activeId)
  const isLastPossible =
    currentQuestion != null &&
    nextQuestionId(flow, currentQuestion.id, answers) === null
  const explicit = currentQuestion && ['short_text', 'long_text', 'multi_choice', 'ranking', 'single_date', 'info_screen'].includes(currentQuestion.type)
  const value = currentQuestion ? answers[currentQuestion.id] : undefined
  const answered = Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null
  const canGoBack = !showEndScreen && flow.backNavigation && activeId !== flow.startQuestionId
  const closeAction = <SurfaceClose onPress={onClose} color={resolvedTheme.colors.text} />
  const action = <SurfaceNext onPress={onAdvance} theme={resolvedTheme}
    label={isLastPossible ? 'Submit' : 'Next'}
    disabled={Boolean(currentQuestion && (isTextInput(currentQuestion.type) || currentQuestion.required) && !answered)} />

  return (
    <View style={[styles.root, { backgroundColor: resolvedTheme.colors.background }]}>
      <View style={styles.header}>
        <SurfaceHeader
          leading={canGoBack ? <SurfaceBack onPress={onBack} color={resolvedTheme.colors.text} /> : closeAction}
          trailing={canGoBack ? closeAction : null}
          center={!showEndScreen ? <View style={styles.progressWrap}>
          {flow.progressStyle === 'bar' ? (
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: resolvedTheme.colors.border },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: resolvedTheme.colors.primary,
                    width: `${Math.round(progress * 100)}%`,
                  },
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
                        i <= flow.questions.findIndex((x) => x.id === activeId)
                          ? resolvedTheme.colors.primary
                          : resolvedTheme.colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View> : null} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.measure}>
        {showEndScreen ? (
          <EndScreen screen={survey.endScreen} theme={resolvedTheme} />
        ) : currentQuestion ? (
          <>
            {renderQuestion(currentQuestion, answers, onAnswerChange, resolvedTheme)}
          </>
        ) : null}
        </View>
      </ScrollView>

      {showEndScreen || explicit ? (
        <View style={styles.footer}>
          <View style={styles.measure}>{showEndScreen
            ? <SurfaceNext onPress={onClose} theme={resolvedTheme} disabled={false} label={survey.endScreen?.cta?.label ?? 'Done'} />
            : action}</View>
        </View>
      ) : null}
    </View>
  )
}

function isTextInput(type: SurveyQuestion['type']): boolean {
  return type === 'short_text' || type === 'long_text'
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
          followUp=""
          onScore={(v) => setAnswer(q.id, v)}
          onFollowUp={() => undefined}
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
}: {
  readonly screen: SurveyEndScreen | null
  readonly theme: ResolvedTheme
}): React.ReactElement {
  const headline = screen?.headline ?? 'Thanks!'
  const body = screen?.body
  return (
    <View style={styles.endRoot}>
      <View
        style={[styles.endBadge, { backgroundColor: surfaceTokens(theme).tint }]}
      >
        <View style={[styles.endTick, { borderColor: theme.colors.primary }]} />
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  progressWrap: { width: '100%', maxWidth: 320 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  body: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  footer: {
    alignItems: 'stretch',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  back: { paddingVertical: 12, paddingHorizontal: 8 },
  inlineNext: {
    alignSelf: 'flex-end',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
  },
  next: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    minWidth: 140,
    alignItems: 'center',
  },
  endRoot: { alignItems: 'center', paddingVertical: 24 },
  endTick: { width: 26, height: 14, borderLeftWidth: 3, borderBottomWidth: 3, transform: [{ rotate: '-45deg' }], marginTop: -5 },
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
