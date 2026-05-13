/**
 * Comments stream beneath a suggestion's dev response.
 * Internal to the SDK. Self-contained: fetches own data + manages
 * its own optimistic state.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { RequestComment } from '@ritmus/sdk-core'
import { Ritmus } from '../../Ritmus.js'

interface CommentsSectionProps {
  readonly requestId: string
  readonly accent: string
}

export function CommentsSection({ requestId, accent }: CommentsSectionProps) {
  const [comments, setComments] = useState<ReadonlyArray<RequestComment>>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await Ritmus.getComments(requestId)
      setComments(items)
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    void load()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load()
    })
    return () => sub.remove()
  }, [load])

  const trimmed = draft.trim()
  const canPost = trimmed.length > 0 && trimmed.length <= 1000 && !posting

  const handlePost = useCallback(async () => {
    if (!canPost) return
    setPosting(true)
    try {
      const created = await Ritmus.postComment(requestId, trimmed)
      if (created) {
        setComments((prev) => [...prev, created])
        setDraft('')
      }
    } catch (e) {
      Alert.alert('Could not post', String((e as Error)?.message ?? e))
    } finally {
      setPosting(false)
    }
  }, [canPost, requestId, trimmed])

  const handleEdit = useCallback(
    async (commentId: string, body: string) => {
      const before = comments
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, body, updatedAt: new Date().toISOString() }
            : c,
        ),
      )
      try {
        const updated = await Ritmus.editComment(requestId, commentId, body)
        if (updated) {
          setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)))
        }
      } catch (e) {
        setComments(before)
        Alert.alert('Could not save', String((e as Error)?.message ?? e))
      }
    },
    [comments, requestId],
  )

  const handleDelete = useCallback(
    (commentId: string) => {
      const confirm = () => {
        const before = comments
        setComments((prev) => prev.filter((c) => c.id !== commentId))
        void Ritmus.deleteComment(requestId, commentId).catch((e: unknown) => {
          setComments(before)
          Alert.alert('Could not delete', String((e as Error)?.message ?? e))
        })
      }
      Alert.alert('Delete comment?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirm },
      ])
    },
    [comments, requestId],
  )

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
      </Text>

      <View style={styles.composeCard}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          maxLength={1000}
          multiline
          style={styles.composeInput}
          placeholder="Add a comment…"
          placeholderTextColor="#9ca3af"
          textAlignVertical="top"
        />
        <View style={styles.composeFooter}>
          <Text style={styles.counter}>{draft.length}/1000</Text>
          <Pressable
            onPress={handlePost}
            disabled={!canPost}
            style={[
              styles.postBtn,
              { backgroundColor: canPost ? accent : '#e5e7eb' },
            ]}
          >
            <Text
              style={[
                styles.postBtnText,
                { color: canPost ? '#fff' : '#9ca3af' },
              ]}
            >
              {posting ? 'Posting…' : 'Post'}
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 12 }} />
      ) : comments.length === 0 ? (
        <Text style={styles.empty}>
          No comments yet — be the first to weigh in.
        </Text>
      ) : (
        comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            accent={accent}
            isEditing={editingId === c.id}
            onStartEdit={() => setEditingId(c.id)}
            onCancelEdit={() => setEditingId(null)}
            onSubmitEdit={async (body) => {
              await handleEdit(c.id, body)
              setEditingId(null)
            }}
            onDelete={() => handleDelete(c.id)}
          />
        ))
      )}
    </View>
  )
}

interface CommentRowProps {
  readonly comment: RequestComment
  readonly accent: string
  readonly isEditing: boolean
  readonly onStartEdit: () => void
  readonly onCancelEdit: () => void
  readonly onSubmitEdit: (body: string) => Promise<void>
  readonly onDelete: () => void
}

function CommentRow({
  comment,
  accent,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
}: CommentRowProps) {
  const [draft, setDraft] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) setDraft(comment.body)
  }, [isEditing, comment.body])

  const trimmed = draft.trim()
  const canSave = trimmed.length > 0 && trimmed.length <= 1000 && !saving

  const showOverflow = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit', 'Delete', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) onStartEdit()
          if (idx === 1) onDelete()
        },
      )
    } else {
      Alert.alert('Comment', undefined, [
        { text: 'Edit', onPress: onStartEdit },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }, [onDelete, onStartEdit])

  const wasEdited = comment.updatedAt !== comment.createdAt

  return (
    <View style={styles.commentCard}>
      <View style={styles.commentHeader}>
        <View
          style={[
            styles.authorBadge,
            comment.viewerIsAuthor
              ? { backgroundColor: accent }
              : styles.authorBadgeOther,
          ]}
        >
          <Text
            style={[
              styles.authorBadgeText,
              { color: comment.viewerIsAuthor ? '#fff' : '#374151' },
            ]}
          >
            {comment.viewerIsAuthor ? 'You' : 'Anon'}
          </Text>
        </View>
        <Text style={styles.commentTime}>
          {formatRelative(comment.createdAt)}
          {wasEdited ? ' · edited' : ''}
        </Text>
        {comment.viewerIsAuthor && !isEditing ? (
          <Pressable
            onPress={showOverflow}
            hitSlop={12}
            style={styles.overflowBtn}
          >
            <Text style={styles.overflowDots}>⋯</Text>
          </Pressable>
        ) : null}
      </View>

      {isEditing ? (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            maxLength={1000}
            multiline
            style={[styles.editInput, { borderColor: accent + '55' }]}
            textAlignVertical="top"
            autoFocus
          />
          <View style={styles.editActions}>
            <Pressable onPress={onCancelEdit} hitSlop={8}>
              <Text style={styles.editCancel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!canSave) return
                setSaving(true)
                try {
                  await onSubmitEdit(trimmed)
                } finally {
                  setSaving(false)
                }
              }}
              disabled={!canSave}
              style={[
                styles.editSaveBtn,
                { backgroundColor: canSave ? accent : '#e5e7eb' },
              ]}
            >
              <Text
                style={[
                  styles.editSaveText,
                  { color: canSave ? '#fff' : '#9ca3af' },
                ]}
              >
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.commentBody}>{comment.body}</Text>
      )}
    </View>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  composeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  composeInput: {
    minHeight: 60,
    fontSize: 14,
    color: '#111',
    paddingVertical: 4,
  },
  composeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  counter: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  postBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  postBtnText: { fontSize: 13, fontWeight: '600' },
  empty: { marginTop: 16, fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  commentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  authorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  authorBadgeOther: { backgroundColor: '#f3f4f6' },
  authorBadgeText: { fontSize: 11, fontWeight: '700' },
  commentTime: { fontSize: 11, color: '#9ca3af', flex: 1 },
  overflowBtn: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowDots: { fontSize: 18, color: '#6b7280', lineHeight: 18 },
  commentBody: { fontSize: 14, lineHeight: 20, color: '#111' },
  editInput: {
    minHeight: 70,
    fontSize: 14,
    color: '#111',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 10,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  editCancel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  editSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  editSaveText: { fontSize: 13, fontWeight: '600' },
})
