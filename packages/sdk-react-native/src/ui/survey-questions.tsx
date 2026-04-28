// Survey-specific question widgets.
// Kept in one file since each is small (~30-60 lines) and they share helpers.

import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type {
  InfoScreenQuestion as IQ,
  LikertQuestion as LQ,
  LongTextQuestion as LTQ,
  MultiChoiceQuestion as MCQ,
  RankingQuestion as RQ,
  SingleChoiceQuestion as SCQ,
  SingleDateQuestion as SDQ,
  SurveyAnswerValue,
} from '@ritmus/sdk-core'
import type { ResolvedTheme } from './theme.js'

const DEFAULT_LIKERT: readonly [string, string, string, string, string] = [
  'Strongly disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly agree',
]

function TitleBlock({
  title,
  subtitle,
  theme,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly theme: ResolvedTheme
}): React.ReactElement {
  return (
    <View>
      <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            { color: theme.colors.subtext, fontFamily: theme.fontFamily },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

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
      <TitleBlock title={question.title} subtitle={question.subtitle} theme={theme} />
      <View style={styles.list}>
        {question.options.map((o) => {
          const selected = value === o.id
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.choice,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? theme.colors.background : theme.colors.text,
                  fontFamily: theme.fontFamily,
                  fontWeight: selected ? '700' : '500',
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          )
        })}
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
  const set = new Set(value)
  function toggle(id: string): void {
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const max = question.maxSelections
    if (max && set.size > max) return
    onChange(Array.from(set))
  }
  return (
    <View>
      <TitleBlock title={question.title} subtitle={question.subtitle} theme={theme} />
      <View style={styles.list}>
        {question.options.map((o) => {
          const selected = set.has(o.id)
          return (
            <Pressable
              key={o.id}
              onPress={() => toggle(o.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={[
                styles.choice,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? theme.colors.background : theme.colors.text,
                  fontFamily: theme.fontFamily,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          )
        })}
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
      <TitleBlock title={question.title} subtitle={question.subtitle} theme={theme} />
      <View style={styles.likertRow}>
        {labels.map((label, idx) => {
          const score = idx + 1
          const selected = value === score
          return (
            <Pressable
              key={label}
              onPress={() => onChange(score)}
              style={[
                styles.likertCell,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? theme.colors.background : theme.colors.text,
                  fontSize: 14,
                  textAlign: 'left',
                  fontFamily: theme.fontFamily,
                }}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
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
      <TitleBlock title={question.title} subtitle={question.subtitle} theme={theme} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={question.placeholder ?? ''}
        placeholderTextColor={theme.colors.subtext}
        maxLength={question.maxLength}
        multiline
        numberOfLines={6}
        style={[
          styles.longTextInput,
          {
            borderColor: theme.colors.border,
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
          },
        ]}
      />
      {question.maxLength ? (
        <Text
          style={[styles.counter, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}
        >
          {(value ?? '').length} / {question.maxLength}
        </Text>
      ) : null}
    </View>
  )
}

// ---------- Ranking (up/down arrows — simpler than gestures; sufficient for v1) ----------

export function RankingQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<RQ, ReadonlyArray<string>>): React.ReactElement {
  const ordered = useMemo<ReadonlyArray<string>>(() => {
    if (value && value.length === question.items.length) return value
    return question.items.map((i) => i.id)
  }, [value, question.items])

  function move(idx: number, dir: -1 | 1): void {
    const next = [...ordered]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    const tmp = next[idx]
    const other = next[target]
    if (tmp === undefined || other === undefined) return
    next[idx] = other
    next[target] = tmp
    onChange(next)
  }

  return (
    <View>
      <TitleBlock title={question.title} subtitle={question.subtitle} theme={theme} />
      <View style={styles.list}>
        {ordered.map((id, idx) => {
          const item = question.items.find((x) => x.id === id)
          if (!item) return null
          return (
            <View
              key={id}
              style={[styles.rankRow, { borderColor: theme.colors.border }]}
            >
              <Text
                style={{
                  width: 24,
                  color: theme.colors.subtext,
                  fontFamily: theme.fontFamily,
                }}
              >
                {idx + 1}.
              </Text>
              <Text
                style={{
                  flex: 1,
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily,
                }}
              >
                {item.label}
              </Text>
              <Pressable
                onPress={() => move(idx, -1)}
                disabled={idx === 0}
                style={styles.rankBtn}
                accessibilityLabel="Move up"
              >
                <Text
                  style={{
                    color: idx === 0 ? theme.colors.border : theme.colors.primary,
                    fontSize: 18,
                  }}
                >
                  ↑
                </Text>
              </Pressable>
              <Pressable
                onPress={() => move(idx, 1)}
                disabled={idx === ordered.length - 1}
                style={styles.rankBtn}
                accessibilityLabel="Move down"
              >
                <Text
                  style={{
                    color:
                      idx === ordered.length - 1 ? theme.colors.border : theme.colors.primary,
                    fontSize: 18,
                  }}
                >
                  ↓
                </Text>
              </Pressable>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ---------- Single date (simple text input; host apps can register a native picker later) ----------

export function SingleDateQuestionView({
  question,
  value,
  onChange,
  theme,
}: SurveyQuestionProps<SDQ, string>): React.ReactElement {
  const [local, setLocal] = useState<string>(value ?? '')
  return (
    <View>
      <TitleBlock title={question.title} subtitle={question.subtitle} theme={theme} />
      <TextInput
        value={local}
        onChangeText={(s) => {
          setLocal(s)
          onChange(s)
        }}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.colors.subtext}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        style={[
          styles.dateInput,
          {
            borderColor: theme.colors.border,
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
          },
        ]}
      />
    </View>
  )
}

// ---------- Info screen (no answer collected; auto-advance via Next) ----------

export function InfoScreenView({
  question,
  theme,
}: {
  readonly question: IQ
  readonly theme: ResolvedTheme
}): React.ReactElement {
  return (
    <View>
      <TitleBlock title={question.title} theme={theme} />
      {question.body ? (
        <Text
          style={[styles.body, { color: theme.colors.text, fontFamily: theme.fontFamily }]}
        >
          {question.body}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, marginTop: 8 },
  list: { marginTop: 12, gap: 8 },
  choice: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  longTextInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  likertRow: {
    // Stack the 5 options vertically. Five chips in a row don't fit
    // long labels like "Strongly disagree" — they truncate / wrap and
    // the row spills off the phone preview. A vertical list reads
    // cleanly on every screen size.
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
  },
  likertCell: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  rankBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  dateInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
})
