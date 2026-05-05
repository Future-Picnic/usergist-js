import * as React from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { Request as RequestDto, RequestStatus } from '@ritmus/sdk-core'
import { Ritmus } from '../Ritmus.js'

const STATUS_COLOR: Record<RequestStatus, string> = {
  under_review: '#9CA3AF',
  planned: '#3B82F6',
  in_progress: '#F59E0B',
  shipped: '#22C55E',
  declined: '#EF4444',
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  under_review: 'Under review',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}

export interface RequestDetailViewProps {
  readonly visible: boolean
  readonly requestId: string | null
  readonly onClose: () => void
  readonly accentColor?: string
}

export function RequestDetailView({
  visible,
  requestId,
  onClose,
  accentColor = '#6C5CE7',
}: RequestDetailViewProps) {
  const [data, setData] = React.useState<RequestDto | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!visible || !requestId) return
    setLoading(true)
    void (async () => {
      try {
        const list = await Ritmus.getRequests({ q: '', limit: 50 })
        const found = list.items.find((r) => r.id === requestId)
        if (found) {
          setData({
            id: found.id,
            appId: '',
            title: found.title,
            description: found.description,
            status: found.status,
            devResponse: null,
            upvoteCount: found.upvoteCount,
            followerCount: found.followerCount,
            createdAt: found.createdAt,
            updatedAt: found.createdAt,
            statusChangedAt: found.statusChangedAt,
            lastRespondedAt: null,
            viewerHasUpvoted: found.viewerHasUpvoted,
            viewerIsFollowing: found.viewerIsFollowing,
            viewerIsSubmitter: false,
          })
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [visible, requestId])

  const onUpvote = () => {
    if (!data) return
    const next = !data.viewerHasUpvoted
    setData({
      ...data,
      viewerHasUpvoted: next,
      viewerIsFollowing: next ? true : data.viewerIsFollowing,
      upvoteCount: Math.max(0, data.upvoteCount + (next ? 1 : -1)),
      followerCount:
        next && !data.viewerIsFollowing
          ? data.followerCount + 1
          : data.followerCount,
    })
    void Ritmus.voteOnRequest(data.id, next).catch(() => {
      // rollback handled in cache; refetch from cache for consistency
    })
  }

  const onFollow = () => {
    if (!data) return
    const next = !data.viewerIsFollowing
    setData({
      ...data,
      viewerIsFollowing: next,
      followerCount: Math.max(0, data.followerCount + (next ? 1 : -1)),
    })
    void Ritmus.followRequest(data.id, next).catch(() => {})
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.action, { color: accentColor }]}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Request</Text>
          <View style={{ width: 50 }} />
        </View>
        {loading || !data ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={accentColor} />
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View
              style={[
                styles.statusPill,
                {
                  borderColor: STATUS_COLOR[data.status] + '88',
                  backgroundColor: STATUS_COLOR[data.status] + '22',
                },
              ]}
            >
              <Text style={[styles.statusText, { color: STATUS_COLOR[data.status] }]}>
                {STATUS_LABEL[data.status]}
              </Text>
            </View>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.meta}>
              {data.upvoteCount} upvotes · {data.followerCount} followers
            </Text>
            <Text style={styles.description}>{data.description}</Text>

            {data.devResponse ? (
              <View style={[styles.response, { borderLeftColor: accentColor }]}>
                <Text style={styles.responseLabel}>From the team</Text>
                <Text style={styles.responseBody}>{data.devResponse}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.actionButton,
                  data.viewerHasUpvoted
                    ? { backgroundColor: accentColor }
                    : { backgroundColor: '#f3f4f6' },
                ]}
                onPress={onUpvote}
              >
                <Text
                  style={[
                    styles.actionLabel,
                    { color: data.viewerHasUpvoted ? '#fff' : '#111' },
                  ]}
                >
                  {data.viewerHasUpvoted ? '✓ Upvoted' : 'Upvote'}
                </Text>
              </Pressable>
              <Pressable style={styles.followButton} onPress={onFollow}>
                <Text style={[styles.actionLabel, { color: '#111' }]}>
                  {data.viewerIsFollowing ? '✓ Following' : 'Follow'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
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
  headerTitle: { fontSize: 17, fontWeight: '600' },
  action: { fontSize: 15 },
  body: { padding: 16 },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
  },
  statusText: { fontSize: 11, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '600', color: '#111' },
  meta: { color: '#6b7280', marginTop: 4 },
  description: { marginTop: 16, fontSize: 15, lineHeight: 22, color: '#1f2937' },
  response: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderLeftWidth: 4,
    borderRadius: 6,
  },
  responseLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  responseBody: { fontSize: 14, color: '#111', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 24 },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  followButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  actionLabel: { fontSize: 15, fontWeight: '500' },
})
