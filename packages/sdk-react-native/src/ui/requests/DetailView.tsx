import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import type { Request as RequestDetailDto } from '@usergist/sdk-core/mobile'
import { UserGist } from '../../UserGist.js'
import { applyOptimisticFollow, applyOptimisticVote, useRequestsTheme, type Branding } from './shared.js'
import { SurfaceBack, SurfaceHeader } from '../SurfaceControls.js'
import type { ResolvedTheme } from '../theme.js'
import { CommentsSection } from './CommentsSection.js'
import { DetailContent } from './DetailContent.js'

export interface DetailViewProps {
  readonly branding: Branding
  readonly requestId: string
  readonly onBack: () => void
}

export function DetailView({ branding, requestId, onBack }: DetailViewProps) {
  const theme = useRequestsTheme(branding)
  const [data, setData] = useState<RequestDetailDto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const r = await UserGist.getRequest(requestId)
        if (!cancelled) setData(r)
      } catch {
        // Rendered below as the "could not load" state.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [requestId])

  const onUpvote = useCallback(async () => {
    if (!data) return
    const before = data
    const next = !data.viewerHasUpvoted
    setData(applyOptimisticVote(data, next))
    try {
      await UserGist.voteOnRequest(data.id, next)
    } catch (e) {
      setData(before)
      Alert.alert('Vote failed', String(e))
    }
  }, [data])

  const onFollow = useCallback(async () => {
    if (!data) return
    const before = data
    const next = !data.viewerIsFollowing
    setData(applyOptimisticFollow(data, next))
    try {
      await UserGist.followRequest(data.id, next)
    } catch (e) {
      setData(before)
      Alert.alert('Follow failed', String(e))
    }
  }, [data])

  return (
    <DetailFrame theme={theme} onBack={onBack}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      ) : !data ? (
        <View style={styles.centered}>
          <Text style={[styles.errorTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
            This suggestion couldn&apos;t load
          </Text>
          <Text style={[styles.errorBody, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
            Check your connection, then go back and open it again.
          </Text>
        </View>
      ) : (
        <DetailContent
          theme={theme}
          data={data}
          onUpvote={() => { void onUpvote() }}
          onFollow={() => { void onFollow() }}
          comments={<CommentsSection requestId={data.id} theme={theme} />}
        />
      )}
    </DetailFrame>
  )
}

/** Header + themed background shared by the live detail and the preview. */
export function DetailFrame({ theme, onBack, children }: {
  readonly theme: ResolvedTheme
  readonly onBack: () => void
  readonly children: React.ReactNode
}) {
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <SurfaceHeader
          leading={<SurfaceBack onPress={onBack} color={theme.colors.text} label="Back to requests"
            testID="request-detail-back" />}
          center={
            <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
              Suggestion
            </Text>
          }
        />
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  header: { paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  errorTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
})
