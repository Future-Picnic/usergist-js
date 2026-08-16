// Pure-presentational feedback bottom-sheet renderer used by the
// dashboard composer's live preview. Same JSX shape as PromptSheet
// (scrim + sheet + skip/submit) minus Modal + animations + dismiss
// wiring. The dashboard mounts this via react-native-web inside an
// iPhone PhoneFrame so the BUILD / DESIGN previews show exactly what
// the SDK ships on iOS / Android.

import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { PromptTheme, Question } from '@usergist/sdk-core'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from '../ui/theme.js'
import { RatingQuestion } from '../ui/questions/RatingQuestion.js'
import { NpsQuestion } from '../ui/questions/NpsQuestion.js'
import { MultipleChoiceQuestion } from '../ui/questions/MultipleChoiceQuestion.js'
import { ShortTextQuestion } from '../ui/questions/ShortTextQuestion.js'

export interface PromptShellProps {
  readonly questions: ReadonlyArray<Question>
  readonly currentQuestionId?: string | null
  readonly theme?: PromptTheme | null
}

// Tap-to-select questions auto-advance — mirrors PromptSheet:
//   - rating / nps: always
//   - multiple_choice: only when single-select (multiSelect=false)
function shouldAutoAdvance(q: Question): boolean {
  if (q.type === 'rating' || q.type === 'nps') return true
  if (q.type === 'multiple_choice') return !q.multiSelect
  return false
}

function isTextInput(type: Question['type']): boolean {
  return type === 'short_text'
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
  // currentIndex retained for potential progress display in future
  // iterations; isLast is no longer needed since the button text is
  // always 'Next' (the runtime fires submit when there's nowhere
  // further to go).
  void currentIndex

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
        <View style={styles.headerRow}>
          <View
            style={[styles.handle, { backgroundColor: resolvedTheme.colors.border }]}
          />
          <View style={styles.closeBtn}>
            <Text
              style={{
                color: resolvedTheme.colors.text,
                fontFamily: resolvedTheme.fontFamily,
                fontSize: 14,
                fontWeight: '600',
                lineHeight: 18,
              }}
            >
              ✕
            </Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {current ? (
            <>
              {renderQuestion(current, resolvedTheme)}
              {isTextInput(current.type) ? (
                <View
                  style={[
                    styles.next,
                    { backgroundColor: resolvedTheme.colors.primary, opacity: 0.4 },
                  ]}
                >
                  <Text
                    style={{
                      color: '#ffffff',
                      fontWeight: '700',
                      fontFamily: resolvedTheme.fontFamily,
                      fontSize: 16,
                    }}
                  >
                    Next
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
        {current && !shouldAutoAdvance(current) && !isTextInput(current.type) ? (
          <View
            style={[styles.next, { backgroundColor: resolvedTheme.colors.primary }]}
          >
            <Text
              style={{
                color: '#ffffff',
                fontWeight: '700',
                fontFamily: resolvedTheme.fontFamily,
                fontSize: 16,
              }}
            >
              Next
            </Text>
          </View>
        ) : null}
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
    minHeight: 280,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
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
    paddingBottom: 16,
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
