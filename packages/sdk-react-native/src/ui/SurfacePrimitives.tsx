// Content primitives shared by feedback and survey questions: title block,
// selectable choice row and text field. Theme colours only — no fixed greys.
import React, { useContext, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { surfaceTokens, withAlpha, type ResolvedTheme } from './theme.js'
import { QuestionImageHeader } from './QuestionImageHeader.js'
import { SurfaceFieldFocus } from './useSurfaceFieldReveal.js'

export function QuestionHeader({ title, subtitle, imageUrl, theme, align = 'left' }: {
  title: string; subtitle?: string | null; imageUrl?: string | null; theme: ResolvedTheme; align?: 'left' | 'center'
}) {
  return (
    <View style={styles.headerBlock}>
      {imageUrl ? <QuestionImageHeader uri={imageUrl} radius={Math.max(8, theme.radius - 6)} /> : null}
      <Text accessibilityRole="header"
        style={[styles.title, { color: theme.colors.text, fontFamily: theme.fontFamily, textAlign: align }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.subtext, fontFamily: theme.fontFamily, textAlign: align }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Selectable row. Selection is shown with a tinted fill, a primary border and
 * a radio/checkbox indicator — never a solid flood of the brand colour, which
 * hides the label on light primaries and shouts on dark ones.
 */
export function ChoiceRow({ label, detail, selected, kind, onPress, theme, testID, leading }: {
  label: string; detail?: string | null; selected: boolean; kind: 'radio' | 'checkbox'
  onPress: () => void; theme: ResolvedTheme; testID?: string; leading?: string
}) {
  const tokens = surfaceTokens(theme)
  const accent = theme.colors.primary
  return (
    <Pressable onPress={onPress} testID={testID}
      accessibilityRole={kind} accessibilityLabel={label}
      accessibilityState={kind === 'radio' ? { selected } : { checked: selected }}
      style={({ pressed }) => [styles.choice, {
        borderRadius: Math.min(theme.radius, 16),
        borderColor: selected ? accent : theme.colors.border,
        backgroundColor: selected ? tokens.tint : pressed ? tokens.fill : 'transparent',
      }]}>
      {leading !== undefined ? (
        <Text style={[styles.leading, { color: selected ? accent : theme.colors.text, fontFamily: theme.fontFamily }]}>
          {leading}
        </Text>
      ) : null}
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>{label}</Text>
        {detail ? (
          <Text style={[styles.choiceDetail, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>{detail}</Text>
        ) : null}
      </View>
      <View style={[kind === 'radio' ? styles.radio : styles.checkbox, {
        borderColor: selected ? accent : withAlpha(theme.colors.text, 0.25),
        backgroundColor: selected && kind === 'checkbox' ? accent : 'transparent',
      }]}>
        {selected && kind === 'radio' ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
        {selected && kind === 'checkbox' ? <View style={[styles.tick, { borderColor: tokens.onPrimary }]} /> : null}
      </View>
    </Pressable>
  )
}

/** Text field with a visible focus state and optional character count. */
export function SurfaceField({ theme, value, maxLength, multiline = false, minHeight, ...rest }: TextInputProps & {
  theme: ResolvedTheme; value: string; minHeight?: number
}) {
  const [focused, setFocused] = useState(false)
  const fieldRef = useRef<View>(null)
  const surfaceFocus = useContext(SurfaceFieldFocus)
  const tokens = surfaceTokens(theme)
  const near = maxLength ? value.length >= maxLength * 0.9 : false
  return (
    <View ref={fieldRef} collapsable={false}>
      <TextInput
        {...rest}
        value={value}
        maxLength={maxLength}
        multiline={multiline}
        placeholderTextColor={withAlpha(theme.colors.subtext, 0.8)}
        selectionColor={theme.colors.primary}
        onFocus={(e) => { setFocused(true); surfaceFocus?.(fieldRef.current); rest.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); surfaceFocus?.(null); rest.onBlur?.(e) }}
        style={[styles.field, multiline && { minHeight: minHeight ?? 112, textAlignVertical: 'top' }, {
          borderRadius: Math.min(theme.radius, 14),
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
          backgroundColor: tokens.fill,
          borderColor: focused ? theme.colors.primary : 'transparent',
        }]}
      />
      {maxLength ? (
        <Text style={[styles.counter, { color: near ? theme.colors.text : theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {value.length}/{maxLength}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  headerBlock: { marginBottom: 16 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1.5,
  },
  leading: { fontSize: 16, fontWeight: '700', minWidth: 22, fontVariant: ['tabular-nums'] },
  choiceText: { flex: 1 },
  choiceLabel: { fontSize: 16, lineHeight: 21, fontWeight: '500' },
  choiceDetail: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.75, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.75, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 10, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '-45deg' }], marginTop: -2 },
  field: { fontSize: 16, lineHeight: 22, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, borderWidth: 1.5 },
  counter: { fontSize: 12, marginTop: 6, textAlign: 'right', fontVariant: ['tabular-nums'] },
})
