// Pure-presentational feedback bottom-sheet renderer used by the
// dashboard composer's live preview. Same JSX shape as PromptSheet
// (scrim + sheet + skip/submit) minus Modal + animations + dismiss
// wiring. The dashboard mounts this via react-native-web inside an
// iPhone PhoneFrame so the BUILD / DESIGN previews show exactly what
// the SDK ships on iOS / Android.

import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { CONTENT_MAX_WIDTH, SurfaceClose, SurfaceHeader, SurfaceNext } from '../ui/SurfaceControls.js'
import type { PromptTheme, Question } from '@usergist/sdk-core/mobile'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from '../ui/theme.js'
import { RatingQuestion } from '../ui/questions/RatingQuestion.js'
import { NpsQuestion } from '../ui/questions/NpsQuestion.js'
import { MultipleChoiceQuestion } from '../ui/questions/MultipleChoiceQuestion.js'
import { ShortTextQuestion } from '../ui/questions/ShortTextQuestion.js'
import {
  promptNeedsExplicitNext,
  promptNextRequiresAnswer,
} from '../internal/prompt-flow.js'

export interface PromptShellProps {
  readonly questions: ReadonlyArray<Question>
  readonly currentQuestionId?: string | null
  readonly theme?: PromptTheme | null
}

export function PromptShell({
  questions,
  currentQuestionId,
  theme,
}: PromptShellProps): React.ReactElement {
  const resolvedTheme = useMemo<ResolvedTheme>(
    () => mergeTheme(DEFAULT_THEME, theme ?? undefined),
    [theme],
  )
  const current =
    questions.find((q) => q.id === currentQuestionId) ?? questions[0] ?? null
  const currentIndex = current
    ? Math.max(
        0,
        questions.findIndex((q) => q.id === current.id),
      )
    : 0
  const needsNext = current && promptNeedsExplicitNext(current)
  const action = <SurfaceNext onPress={() => undefined} theme={resolvedTheme}
    disabled={Boolean(current && promptNextRequiresAnswer(current))}
    label={currentIndex === questions.length - 1 ? 'Submit' : 'Next'} />

  return (
    <View style={styles.root}>
      <View style={styles.scrim} pointerEvents="none" />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: resolvedTheme.colors.background,
            borderTopLeftRadius: resolvedTheme.radius,
            borderTopRightRadius: resolvedTheme.radius,
          },
        ]}
      >
        <SurfaceHeader leading={<SurfaceClose onPress={() => undefined} color={resolvedTheme.colors.text} />}
          center={questions.length > 1 ? <Text style={{ color: resolvedTheme.colors.subtext }}>{currentIndex + 1} of {questions.length}</Text> : null} />
        <View style={styles.measure}>
        <ScrollView contentContainerStyle={styles.body}>
          {current ? (
            <>
              {renderQuestion(current, resolvedTheme)}
            </>
          ) : null}
        </ScrollView>
        {needsNext ? <View style={styles.footer}>{action}</View> : null}
        </View>
      </View>
    </View>
  )
}

function renderQuestion(q: Question, theme: ResolvedTheme): React.ReactElement {
  switch (q.type) {
    case 'rating':
      return (
        <RatingQuestion
          question={q}
          value={null}
          onChange={() => undefined}
          theme={theme}
        />
      )
    case 'nps':
      return (
        <NpsQuestion
          question={q}
          score={null}
          followUp=""
          onScore={() => undefined}
          onFollowUp={() => undefined}
          theme={theme}
        />
      )
    case 'multiple_choice':
      return (
        <MultipleChoiceQuestion
          question={q}
          value={[]}
          onChange={() => undefined}
          theme={theme}
        />
      )
    case 'short_text':
      return (
        <ShortTextQuestion
          question={q}
          value=""
          onChange={() => undefined}
          theme={theme}
        />
      )
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '100%',
    flexShrink: 1,
    width: '100%',
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', flexShrink: 1 },
  footer: { paddingHorizontal: 12, paddingTop: 4 },
  headerRow: {
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
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 20,
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
