// Survey-specific question widgets, built on the shared surface primitives so
// surveys and feedback share one visual language.

import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type {
  InfoScreenQuestion as IQ,
  LikertQuestion as LQ,
  LongTextQuestion as LTQ,
  MultiChoiceQuestion as MCQ,
  RankingQuestion as RQ,
  SingleChoiceQuestion as SCQ,
  SingleDateQuestion as SDQ,
  SurveyAnswerValue,
} from '@usergist/sdk-core/mobile'
import { surfaceTokens, withAlpha, type ResolvedTheme } from './theme.js'
import { ChoiceRow, QuestionHeader, SurfaceField } from './SurfacePrimitives.js'

const DEFAULT_LIKERT: readonly [string, string, string, string, string] = [
  'Strongly disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly agree',
]

export interface SurveyQuestionProps<Q, V> {
  readonly question: Q
  readonly value: V
  readonly onChange: (v: SurveyAnswerValue) => void
  readonly theme: ResolvedTheme
}

// ---------- Single choice ----------

export function SingleChoiceQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<SCQ, string | null>): React.ReactElement {
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl} theme={theme} />
      <View style={styles.list}>
        {question.options.map((o) => (
          <ChoiceRow key={o.id} label={o.label} selected={value === o.id} kind="radio"
            onPress={() => onChange(o.id)} theme={theme} />
        ))}
      </View>
    </View>
  )
}

// ---------- Multi choice ----------

export function MultiChoiceQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<MCQ, ReadonlyArray<string>>): React.ReactElement {
  const selected = new Set(value)
  function toggle(id: string): void {
    const next = selected.has(id) ? value.filter((v) => v !== id) : [...value, id]
    const max = question.maxSelections
    if (max && next.length > max) return
    onChange(next)
  }
  const hint = question.subtitle
    ?? (question.maxSelections ? `Choose up to ${question.maxSelections}` : 'Choose all that apply')
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={hint} imageUrl={question.imageUrl} theme={theme} />
      <View style={styles.list}>
        {question.options.map((o) => (
          <ChoiceRow key={o.id} label={o.label} selected={selected.has(o.id)} kind="checkbox"
            onPress={() => toggle(o.id)} theme={theme} />
        ))}
      </View>
    </View>
  )
}

// ---------- Likert ----------

export function LikertQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<LQ, number | null>): React.ReactElement {
  const labels = question.labels ?? DEFAULT_LIKERT
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl} theme={theme} />
      {/* Vertical: five long labels never fit a phone row without truncating. */}
      <View style={styles.list}>
        {labels.map((label, idx) => (
          <ChoiceRow key={label} label={label} selected={value === idx + 1} kind="radio"
            onPress={() => onChange(idx + 1)} theme={theme} />
        ))}
      </View>
    </View>
  )
}

// ---------- Long text ----------

export function LongTextQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<LTQ, string>): React.ReactElement {
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl} theme={theme} />
      <SurfaceField
        theme={theme}
        accessibilityLabel={question.title}
        testID={`survey-question-${question.id}-input`}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={question.placeholder ?? ''}
        maxLength={question.maxLength}
        multiline
        minHeight={132}
      />
    </View>
  )
}

// ---------- Ranking (move buttons — accessible without drag gestures) ----------

export function RankingQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<RQ, ReadonlyArray<string>>): React.ReactElement {
  const tokens = surfaceTokens(theme)
  const ordered = useMemo<ReadonlyArray<string>>(() => {
    if (value && value.length === question.items.length) return value
    return question.items.map((i) => i.id)
  }, [value, question.items])

  function move(idx: number, dir: -1 | 1): void {
    const target = idx + dir
    const a = ordered[idx]
    const b = ordered[target]
    if (a === undefined || b === undefined) return
    onChange(ordered.map((id, i) => (i === idx ? b : i === target ? a : id)))
  }

  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle ?? 'Most important first'}
        imageUrl={question.imageUrl} theme={theme} />
      <View style={styles.list}>
        {ordered.map((id, idx) => {
          const item = question.items.find((x) => x.id === id)
          if (!item) return null
          const first = idx === 0
          const last = idx === ordered.length - 1
          return (
            <View key={id} style={[styles.rankRow, {
              borderColor: theme.colors.border,
              borderRadius: Math.min(theme.radius, 16),
            }]}>
              <View style={[styles.rankBadge, { backgroundColor: tokens.tint }]}>
                <Text style={[styles.rankNumber, { color: theme.colors.primary, fontFamily: theme.fontFamily }]}>
                  {idx + 1}
                </Text>
              </View>
              <Text style={[styles.rankLabel, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
                {item.label}
              </Text>
              <RankMove dir="up" disabled={first} onPress={() => move(idx, -1)} theme={theme} label={`Move ${item.label} up`} />
              <RankMove dir="down" disabled={last} onPress={() => move(idx, 1)} theme={theme} label={`Move ${item.label} down`} />
            </View>
          )
        })}
      </View>
    </View>
  )
}

function RankMove({ dir, disabled, onPress, theme, label }: {
  dir: 'up' | 'down'; disabled: boolean; onPress: () => void; theme: ResolvedTheme; label: string
}): React.ReactElement {
  const color = disabled ? withAlpha(theme.colors.text, 0.2) : theme.colors.text
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} style={({ pressed }) => [styles.rankBtn, pressed && { opacity: 0.5 }]}>
      <View style={[styles.rankChevron, {
        borderColor: color,
        transform: [{ rotate: dir === 'up' ? '135deg' : '-45deg' }],
        marginTop: dir === 'up' ? 4 : -4,
      }]} />
    </Pressable>
  )
}

// ---------- Single date (text input; host apps can register a native picker later) ----------

export function SingleDateQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<SDQ, string>): React.ReactElement {
  const [local, setLocal] = useState<string>(value ?? '')
  return (
    <View>
      <QuestionHeader title={question.title} subtitle={question.subtitle} imageUrl={question.imageUrl} theme={theme} />
      <SurfaceField
        theme={theme}
        accessibilityLabel={question.title}
        testID={`survey-question-${question.id}-input`}
        value={local}
        onChangeText={(s) => {
          setLocal(s)
          onChange(s)
        }}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
    </View>
  )
}

// ---------- Info screen (no answer collected; continue via Next) ----------

export function InfoScreenView({
  question,
  theme,
}: {
  readonly question: IQ
  readonly theme: ResolvedTheme
}): React.ReactElement {
  return (
    <View>
      <QuestionHeader title={question.title} imageUrl={question.imageUrl} theme={theme} />
      {question.body ? (
        <Text style={[styles.body, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {question.body}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 24, marginTop: -4 },
  list: { gap: 8 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5,
    minHeight: 56, paddingLeft: 12, paddingRight: 4,
  },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankNumber: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rankLabel: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500', paddingVertical: 12 },
  rankBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  rankChevron: { width: 9, height: 9, borderLeftWidth: 1.75, borderBottomWidth: 1.75 },
})
