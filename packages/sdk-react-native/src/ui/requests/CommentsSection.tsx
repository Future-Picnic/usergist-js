/**
 * Comments stream beneath a suggestion's dev response.
 * Internal to the SDK. Self-contained: fetches own data + manages
 * its own optimistic state. Rendering lives in CommentsView.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, AppState } from 'react-native'
import type { RequestComment } from '@usergist/sdk-core/mobile'
import { UserGist } from '../../UserGist.js'
import type { ResolvedTheme } from '../theme.js'
import { COMMENT_MAX, CommentsView } from './CommentsView.js'

interface CommentsSectionProps {
  readonly requestId: string
  readonly theme: ResolvedTheme
}

export function CommentsSection({ requestId, theme }: CommentsSectionProps) {
  const [comments, setComments] = useState<ReadonlyArray<RequestComment>>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await UserGist.getComments(requestId)
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
  const canPost = trimmed.length > 0 && trimmed.length <= COMMENT_MAX && !posting

  const handlePost = useCallback(async () => {
    if (!canPost) return
    const submittedBody = trimmed
    setPosting(true)
    setDraft('')
    try {
      const created = await UserGist.postComment(requestId, submittedBody)
      if (created) {
        setComments((prev) => [...prev, created])
      }
    } catch (e) {
      setDraft((current) => (current.length === 0 ? submittedBody : current))
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
        const updated = await UserGist.editComment(requestId, commentId, body)
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
        void UserGist.deleteComment(requestId, commentId).catch((e: unknown) => {
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
    <CommentsView
      theme={theme}
      comments={comments}
      loading={loading}
      draft={draft}
      posting={posting}
      editingId={editingId}
      onDraftChange={setDraft}
      onPost={() => { void handlePost() }}
      onStartEdit={setEditingId}
      onCancelEdit={() => setEditingId(null)}
      onSubmitEdit={async (commentId, body) => {
        await handleEdit(commentId, body)
        setEditingId(null)
      }}
      onDelete={handleDelete}
    />
  )
}
