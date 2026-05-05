import * as React from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { RequestSearchResult } from '@ritmus/sdk-core'
import { Ritmus } from '../Ritmus.js'
import { createDebouncedSearch } from '../internal/requests.js'

export interface SubmitRequestSheetProps {
  readonly visible: boolean
  readonly onClose: () => void
  readonly onSubmitted: (requestId: string) => void
  readonly onPickExisting: (requestId: string) => void
  readonly accentColor?: string
}

export function SubmitRequestSheet({
  visible,
  onClose,
  onSubmitted,
  onPickExisting,
  accentColor = '#6C5CE7',
}: SubmitRequestSheetProps) {
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<ReadonlyArray<RequestSearchResult>>([])

  const search = React.useMemo(
    () =>
      createDebouncedSearch(async (q: string) => {
        if (q.length < 10) return { results: [] as ReadonlyArray<RequestSearchResult> }
        // Use the SDK's transport via Ritmus.getRequests fallback would also work
        // but the dedicated search endpoint is rate-limited differently.
        const e = (Ritmus as unknown as { __engine?: unknown }).__engine
        // Direct transport call requires engine access — we expose via Ritmus.
        // For the sheet, use getRequests with q= as a graceful fallback.
        const r = await Ritmus.getRequests({ q, limit: 5 })
        return {
          results: r.items.slice(0, 5).map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            upvoteCount: s.upvoteCount,
          })),
        }
      }, 300),
    [],
  )

  React.useEffect(() => {
    const unsub = search.subscribe((_q, r) => setSuggestions(r.results))
    return () => {
      unsub()
      search.cancel()
    }
  }, [search])

  React.useEffect(() => {
    if (title.length >= 10) search.query(title)
    else setSuggestions([])
  }, [title, search])

  const reset = () => {
    setTitle('')
    setDescription('')
    setError(null)
    setSuggestions([])
  }

  const handleSubmit = () => {
    setError(null)
    setSubmitting(true)
    Ritmus.submitRequest(title.trim(), description.trim(), (err, req) => {
      setSubmitting(false)
      if (err) {
        setError(err.message)
        return
      }
      if (req) {
        reset()
        onSubmitted(req.id)
      }
    })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.action, { color: accentColor }]}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Suggest a feature</Text>
          <Pressable
            onPress={handleSubmit}
            hitSlop={10}
            disabled={submitting || title.trim().length === 0 || description.trim().length === 0}
          >
            <Text
              style={[
                styles.action,
                {
                  color:
                    submitting || title.trim().length === 0 || description.trim().length === 0
                      ? '#9ca3af'
                      : accentColor,
                },
              ]}
            >
              {submitting ? 'Posting…' : 'Post'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            style={styles.input}
            placeholder="A short, clear title"
          />
          <Text style={styles.counter}>{title.length}/120</Text>

          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsLabel}>Similar requests</Text>
              {suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.suggestionRow}
                  onPress={() => onPickExisting(s.id)}
                >
                  <Text style={styles.suggestionTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.suggestionMeta}>{s.upvoteCount} upvotes</Text>
                </Pressable>
              ))}
              <Text style={styles.postAnyway}>
                Don't see your idea? Post anyway →
              </Text>
            </View>
          ) : null}

          <Text style={[styles.label, { marginTop: 16 }]}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            maxLength={1500}
            multiline
            numberOfLines={6}
            style={[styles.input, styles.textarea]}
            placeholder="What does this do, and why does it matter?"
          />
          <Text style={styles.counter}>{description.length}/1500</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 17, fontWeight: '600' },
  action: { fontSize: 15 },
  body: { padding: 16 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151' },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 15,
    color: '#111',
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  counter: { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 4 },
  suggestions: {
    marginTop: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  suggestionsLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  suggestionTitle: { flex: 1, fontSize: 14, color: '#111' },
  suggestionMeta: { fontSize: 12, color: '#6b7280', marginLeft: 8 },
  postAnyway: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  error: { color: '#ef4444', marginTop: 12, fontSize: 13 },
})
