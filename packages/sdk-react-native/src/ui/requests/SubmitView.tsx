import React, { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { UserGist } from '../../UserGist.js'
import type { Branding } from './shared.js'

export interface SubmitViewProps {
  readonly branding: Branding
  readonly onCancel: () => void
  readonly onPosted: (requestId: string) => void
}

export function SubmitView({ branding, onCancel, onPosted }: SubmitViewProps) {
  const accent = branding.accentColor
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const trimmedTitle = title.trim()
  const trimmedDesc = description.trim()
  const canSubmit = useMemo(
    () =>
      trimmedTitle.length >= 1 &&
      trimmedTitle.length <= 120 &&
      trimmedDesc.length >= 1 &&
      trimmedDesc.length <= 1500 &&
      !submitting,
    [trimmedTitle, trimmedDesc, submitting],
  )

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    UserGist.submitRequest(trimmedTitle, trimmedDesc, (err, req) => {
      setSubmitting(false)
      if (err) {
        Alert.alert('Could not submit', err.message)
        return
      }
      if (req) onPosted(req.id)
      else onCancel()
    })
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New suggestion</Text>
        </View>
        <Pressable
          onPress={handleSubmit}
          hitSlop={12}
          disabled={!canSubmit}
          style={[
            styles.postBtn,
            { backgroundColor: canSubmit ? accent : '#e5e7eb' },
          ]}
        >
          <Text
            style={[
              styles.postBtnText,
              { color: canSubmit ? '#fff' : '#9ca3af' },
            ]}
          >
            {submitting ? 'Posting…' : 'Post'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Tell us what you&apos;d like to see. Other users can upvote your
          idea, and the team will respond as work progresses.
        </Text>

        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Title</Text>
            <Text style={styles.counter}>{title.length}/120</Text>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            style={[
              styles.input,
              title.length > 0 && { borderColor: accent + '55' },
            ]}
            placeholder="A short, clear title"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.counter}>{description.length}/1500</Text>
          </View>
          <TextInput
            value={description}
            onChangeText={setDescription}
            maxLength={1500}
            multiline
            numberOfLines={6}
            style={[
              styles.input,
              styles.textarea,
              description.length > 0 && { borderColor: accent + '55' },
            ]}
            placeholder="What does this do? Who is it for? Why does it matter?"
            placeholderTextColor="#9ca3af"
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  cancelBtn: { minWidth: 60, paddingVertical: 8 },
  cancelText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  postBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  postBtnText: { fontSize: 13, fontWeight: '600' },
  body: { padding: 16, gap: 20 },
  intro: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  field: { gap: 6 },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#111' },
  counter: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
  textarea: { minHeight: 140 },
})
