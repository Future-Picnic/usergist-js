import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { UserGist } from '../../UserGist.js'
import { useRequestsTheme, type Branding } from './shared.js'
import { CONTENT_MAX_WIDTH, SurfaceClose, SurfaceHeader, SurfaceNext } from '../SurfaceControls.js'
import { SurfaceField } from '../SurfacePrimitives.js'
import { surfaceTokens, type ResolvedTheme } from '../theme.js'

export interface SubmitViewProps {
  readonly branding: Branding
  readonly onCancel: () => void
  readonly onPosted: (requestId: string) => void
  /** Base theme override (design preview); defaults to the app's SDK theme. */
  readonly themeOverride?: ResolvedTheme | null
}

const TITLE_MAX = 120
const DESCRIPTION_MAX = 1500

export function SubmitView({ branding, onCancel, onPosted, themeOverride }: SubmitViewProps) {
  const theme = useRequestsTheme(branding, themeOverride)
  const tokens = surfaceTokens(theme)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroll = useRef<ScrollView>(null)
  const focusedField = useRef<'title' | 'description' | null>(null)
  const fieldOffsets = useRef({ title: 0, description: 0 })
  const revealFocusedField = useCallback(() => {
    const field = focusedField.current
    if (field) scroll.current?.scrollTo({ y: fieldOffsets.current[field], animated: false })
  }, [])
  const focusField = (field: 'title' | 'description') => {
    focusedField.current = field
    requestAnimationFrame(revealFocusedField)
  }
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', revealFocusedField)
    const changed = Keyboard.addListener('keyboardDidChangeFrame', revealFocusedField)
    return () => { shown.remove(); changed.remove() }
  }, [revealFocusedField])

  const trimmedTitle = title.trim()
  const trimmedDesc = description.trim()
  const canSubmit = useMemo(
    () =>
      trimmedTitle.length >= 1 &&
      trimmedTitle.length <= TITLE_MAX &&
      trimmedDesc.length >= 1 &&
      trimmedDesc.length <= DESCRIPTION_MAX &&
      !submitting,
    [trimmedTitle, trimmedDesc, submitting],
  )

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    UserGist.submitRequest(trimmedTitle, trimmedDesc, (err, req) => {
      setSubmitting(false)
      if (err) {
        setError(`Your suggestion wasn't posted. ${err.message}`)
        return
      }
      if (req) onPosted(req.id)
      else onCancel()
    })
  }

  const label = (text: string) => (
    <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>{text}</Text>
  )

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <SurfaceHeader
          leading={<SurfaceClose onPress={onCancel} color={theme.colors.text} label="Cancel new suggestion"
            testID="request-submit-cancel" />}
          center={
            <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
              New suggestion
            </Text>
          }
          trailing={<SurfaceNext onPress={handleSubmit} disabled={!canSubmit} loading={submitting} compact
            theme={theme} label="Post" testID="request-submit-post" />}
        />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"
        onLayout={() => requestAnimationFrame(revealFocusedField)}
        keyboardDismissMode="interactive">
        <View style={styles.measure}>
          <Text style={[styles.intro, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
            Share an idea. Others can upvote it, and the team posts updates as work moves forward.
          </Text>

          {error ? (
            <View accessibilityRole="alert" style={[styles.error, {
              backgroundColor: tokens.fill, borderRadius: Math.min(theme.radius, 14),
            }]}>
              <Text style={[styles.errorText, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field} onLayout={event => { fieldOffsets.current.title = event.nativeEvent.layout.y + 20 }}>
            {label('Title')}
            <SurfaceField
              theme={theme}
              accessibilityLabel="Suggestion title"
              value={title}
              onChangeText={setTitle}
              maxLength={TITLE_MAX}
              placeholder="A short, clear title"
              returnKeyType="next"
              autoFocus
              onFocus={() => focusField('title')}
              onBlur={() => { focusedField.current = null }}
            />
          </View>

          <View style={styles.field} onLayout={event => { fieldOffsets.current.description = event.nativeEvent.layout.y + 20 }}>
            {label('Description')}
            <SurfaceField
              theme={theme}
              accessibilityLabel="Suggestion description"
              value={description}
              onChangeText={setDescription}
              maxLength={DESCRIPTION_MAX}
              multiline
              onFocus={() => focusField('description')}
              onBlur={() => { focusedField.current = null }}
              minHeight={140}
              placeholder="What should it do, who is it for, and why does it matter?"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 20 },
  intro: { fontSize: 15, lineHeight: 22 },
  error: { padding: 14 },
  errorText: { fontSize: 15, lineHeight: 21 },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
})
