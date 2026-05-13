import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { Request as RequestDetailDto } from '@ritmus/sdk-core'
import { Ritmus } from '../../Ritmus.js'
import { applyOptimisticFollow, applyOptimisticVote, type Branding } from './shared.js'
import { StatusPill } from './StatusPill.js'
import { CommentsSection } from './CommentsSection.js'

export interface DetailViewProps {
  readonly branding: Branding
  readonly requestId: string
  readonly onBack: () => void
}

export function DetailView({ branding, requestId, onBack }: DetailViewProps) {
  const accent = branding.accentColor
  const [data, setData] = useState<RequestDetailDto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const r = await Ritmus.getRequest(requestId)
        if (!cancelled) setData(r)
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
      await Ritmus.voteOnRequest(data.id, next)
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
      await Ritmus.followRequest(data.id, next)
    } catch (e) {
      setData(before)
      Alert.alert('Follow failed', String(e))
    }
  }, [data])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>SUGGESTION</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading || !data ? (
        <View style={styles.centered}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <StatusPill status={data.status} />
            <Text style={styles.title}>{data.title}</Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: accent }]}>
                  {data.upvoteCount}
                </Text>
                <Text style={styles.statLabel}>upvotes</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.followerCount}</Text>
                <Text style={styles.statLabel}>followers</Text>
              </View>
            </View>

            <Text style={styles.description}>{data.description}</Text>

            {data.devResponse ? (
              <View style={[styles.responseCard, { borderLeftColor: accent }]}>
                <View style={styles.responseHeader}>
                  <View style={[styles.responseBadge, { backgroundColor: accent }]}>
                    <Text style={styles.responseBadgeText}>✓</Text>
                  </View>
                  <Text style={styles.responseLabel}>From the team</Text>
                </View>
                <Text style={styles.responseBody}>{data.devResponse}</Text>
              </View>
            ) : (
              <View style={styles.noResponseCard}>
                <Text style={styles.noResponseTitle}>No update yet</Text>
                <Text style={styles.noResponseBody}>
                  Follow this suggestion to be notified when the team posts an
                  update or moves it forward.
                </Text>
              </View>
            )}

            <CommentsSection requestId={data.id} accent={accent} />
          </ScrollView>

          <View style={styles.actionBar}>
            <Pressable
              style={[
                styles.actionButton,
                data.viewerHasUpvoted
                  ? { backgroundColor: accent }
                  : { backgroundColor: accent + '15' },
              ]}
              onPress={onUpvote}
            >
              <Text
                style={[
                  styles.actionLabel,
                  { color: data.viewerHasUpvoted ? '#fff' : accent },
                ]}
              >
                {data.viewerHasUpvoted
                  ? `▲ Upvoted (${data.upvoteCount})`
                  : `▲ Upvote (${data.upvoteCount})`}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionButton,
                {
                  backgroundColor: data.viewerIsFollowing ? '#111' : '#f3f4f6',
                },
              ]}
              onPress={onFollow}
            >
              <Text
                style={[
                  styles.actionLabel,
                  { color: data.viewerIsFollowing ? '#fff' : '#111' },
                ]}
              >
                {data.viewerIsFollowing ? '✓ Following' : 'Follow'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerEyebrow: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  backBtn: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 28, color: '#111', fontWeight: '300', lineHeight: 28 },
  body: { padding: 20, paddingBottom: 32 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginTop: 12,
    lineHeight: 30,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111' },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  statDivider: { width: 1, height: 30, backgroundColor: '#e5e7eb' },
  description: {
    marginTop: 20,
    fontSize: 15,
    lineHeight: 23,
    color: '#1f2937',
  },
  responseCard: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  responseBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  responseBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  responseLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  responseBody: { fontSize: 14, lineHeight: 21, color: '#111' },
  noResponseCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderStyle: 'dashed',
  },
  noResponseTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  noResponseBody: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionLabel: { fontSize: 15, fontWeight: '700' },
})
