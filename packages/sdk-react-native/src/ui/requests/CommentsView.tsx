/**
 * Presentational comments list + composer. All colours come from the
 * resolved theme. Data, optimistic updates and confirmation live in
 * CommentsSection; the design preview renders this with local fixtures.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { RequestComment } from '@usergist/sdk-core/mobile'
import { SurfaceNext } from '../SurfaceControls.js'
import { SurfaceField } from '../SurfacePrimitives.js'
import { surfaceTokens, type ResolvedTheme } from '../theme.js'

export const COMMENT_MAX = 1000

export interface CommentsViewProps {
  readonly theme: ResolvedTheme
  readonly comments: ReadonlyArray<RequestComment>
  readonly loading: boolean
  readonly draft: string
  readonly posting: boolean
  readonly editingId: string | null
  readonly onDraftChange: (text: string) => void
  readonly onPost: () => void
  readonly onStartEdit: (commentId: string) => void
  readonly onCancelEdit: () => void
  readonly onSubmitEdit: (commentId: string, body: string) => Promise<void>
  readonly onDelete: (commentId: string) => void
}

export function CommentsView(props: CommentsViewProps) {
  const { theme, comments, loading, draft, posting } = props
  const trimmed = draft.trim()
  const canPost = trimmed.length > 0 && trimmed.length <= COMMENT_MAX && !posting
  const textStyle = { color: theme.colors.text, fontFamily: theme.fontFamily }
  const subStyle = { color: theme.colors.subtext, fontFamily: theme.fontFamily }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, textStyle]}>
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </Text>

      <SurfaceField
        theme={theme}
        accessibilityLabel="Request comment"
        testID="request-comment-input"
        value={draft}
        onChangeText={props.onDraftChange}
        maxLength={COMMENT_MAX}
        multiline
        minHeight={72}
        placeholder="Add a comment"
      />
      <View style={styles.composeAction}>
        <SurfaceNext onPress={props.onPost} disabled={!canPost} loading={posting} compact theme={theme}
          label="Post comment" testID="request-comment-post" />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loading} />
      ) : comments.length === 0 ? (
        <Text style={[styles.empty, subStyle]}>No comments yet. Start the conversation.</Text>
      ) : (
        comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            theme={theme}
            isEditing={props.editingId === c.id}
            onStartEdit={() => props.onStartEdit(c.id)}
            onCancelEdit={props.onCancelEdit}
            onSubmitEdit={(body) => props.onSubmitEdit(c.id, body)}
            onDelete={() => props.onDelete(c.id)}
          />
        ))
      )}
    </View>
  )
}

interface CommentRowProps {
  readonly comment: RequestComment
  readonly theme: ResolvedTheme
  readonly isEditing: boolean
  readonly onStartEdit: () => void
  readonly onCancelEdit: () => void
  readonly onSubmitEdit: (body: string) => Promise<void>
  readonly onDelete: () => void
}

function CommentRow({ comment, theme, isEditing, onStartEdit, onCancelEdit, onSubmitEdit, onDelete }: CommentRowProps) {
  const [draft, setDraft] = useState(comment.body)
  const [saving, setSaving] = useState(false)
  const tokens = surfaceTokens(theme)

  useEffect(() => {
    if (!isEditing) setDraft(comment.body)
  }, [isEditing, comment.body])

  const trimmed = draft.trim()
  const canSave = trimmed.length > 0 && trimmed.length <= COMMENT_MAX && !saving

  const showOverflow = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Edit', 'Delete', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
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
  const mine = comment.viewerIsAuthor

  return (
    <View style={[styles.comment, { borderTopColor: theme.colors.border }]}>
      <View style={styles.commentHeader}>
        <View style={[styles.author, { backgroundColor: mine ? tokens.tint : tokens.fill }]}>
          <Text style={[styles.authorText, {
            color: mine ? theme.colors.primary : theme.colors.text, fontFamily: theme.fontFamily,
          }]}>
            {mine ? 'You' : 'Anonymous'}
          </Text>
        </View>
        <Text style={[styles.time, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
          {formatRelative(comment.createdAt)}{wasEdited ? ', edited' : ''}
        </Text>
        {mine && !isEditing ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Comment actions" testID="request-comment-actions"
            onPress={showOverflow} style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]}>
            {[0, 1, 2].map((i) => <View key={i} style={[styles.moreDot, { backgroundColor: theme.colors.subtext }]} />)}
          </Pressable>
        ) : null}
      </View>

      {isEditing ? (
        <View style={styles.editBlock}>
          <SurfaceField theme={theme} value={draft} onChangeText={setDraft} maxLength={COMMENT_MAX}
            multiline minHeight={72} autoFocus accessibilityLabel="Edit comment" />
          <View style={styles.editActions}>
            <Pressable accessibilityRole="button" onPress={onCancelEdit} style={styles.cancel}>
              <Text style={[styles.cancelText, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>Cancel</Text>
            </Pressable>
            <SurfaceNext compact theme={theme} label="Save" disabled={!canSave} loading={saving}
              onPress={async () => {
                if (!canSave) return
                setSaving(true)
                try {
                  await onSubmitEdit(trimmed)
                } finally {
                  setSaving(false)
                }
              }} />
          </View>
        </View>
      ) : (
        <Text style={[styles.body, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>{comment.body}</Text>
      )}
    </View>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const m = Math.floor((Date.now() - then) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

const styles = StyleSheet.create({
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  composeAction: { alignItems: 'flex-end', marginTop: 4 },
  loading: { marginTop: 16 },
  empty: { marginTop: 16, fontSize: 15, lineHeight: 21 },
  comment: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  author: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  authorText: { fontSize: 13, fontWeight: '700' },
  time: { fontSize: 13, flex: 1 },
  more: { width: 44, height: 44, marginVertical: -12, flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center' },
  moreDot: { width: 4, height: 4, borderRadius: 2 },
  body: { fontSize: 15, lineHeight: 22 },
  editBlock: { gap: 4 },
  editActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  cancel: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  cancelText: { fontSize: 15, fontWeight: '600' },
})
