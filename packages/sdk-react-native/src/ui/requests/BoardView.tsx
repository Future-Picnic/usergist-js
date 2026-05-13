import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { RequestStatus, RequestSummary } from '@ritmus/sdk-core'
import { Ritmus } from '../../Ritmus.js'
import {
  STATUS_COLOR,
  STATUS_KEYS,
  STATUS_LABEL,
  applyOptimisticVote,
  type Branding,
  type StatusFilterValue,
} from './shared.js'
import { StatusPill } from './StatusPill.js'

export interface BoardViewProps {
  readonly branding: Branding
  readonly onClose: () => void
  readonly onOpenDetail: (requestId: string) => void
  readonly onOpenSubmit: () => void
}

export function BoardView({
  branding,
  onClose,
  onOpenDetail,
  onOpenSubmit,
}: BoardViewProps) {
  const accent = branding.accentColor
  const accentSoft = accent + '15'

  const [items, setItems] = useState<ReadonlyArray<RequestSummary>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const result = await Ritmus.getRequests({ sort: 'top', limit: 50 })
      setItems(result.items)
    } catch (e) {
      Alert.alert('Could not load suggestions', String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items
    return items.filter((i) => i.status === statusFilter)
  }, [items, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<RequestStatus, number> = {
      under_review: 0,
      planned: 0,
      in_progress: 0,
      shipped: 0,
      declined: 0,
    }
    for (const item of items) counts[item.status] += 1
    return counts
  }, [items])

  const onUpvote = useCallback(async (item: RequestSummary) => {
    const next = !item.viewerHasUpvoted
    setItems((prev) =>
      prev.map((r) => (r.id === item.id ? applyOptimisticVote(r, next) : r)),
    )
    try {
      await Ritmus.voteOnRequest(item.id, next)
    } catch (e) {
      setItems((prev) => prev.map((r) => (r.id === item.id ? item : r)))
      Alert.alert('Vote failed', String(e))
    }
  }, [])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{branding.entryLabel}</Text>
          <Text style={styles.headerSubtitle}>
            {items.length} {items.length === 1 ? 'idea' : 'ideas'}
          </Text>
        </View>
        <Pressable
          onPress={onOpenSubmit}
          hitSlop={12}
          style={[styles.newBtn, { backgroundColor: accent }]}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        <FilterChip
          value="all"
          label="All"
          count={items.length}
          active={statusFilter === 'all'}
          onPress={setStatusFilter}
          accent={accent}
        />
        {STATUS_KEYS.map((s) => {
          const count = statusCounts[s]
          if (count === 0) return null
          return (
            <FilterChip
              key={s}
              value={s}
              label={STATUS_LABEL[s]}
              count={count}
              active={statusFilter === s}
              onPress={setStatusFilter}
              accent={accent}
              dotColor={STATUS_COLOR[s]}
            />
          )
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={accent}
            />
          }
          ListEmptyComponent={
            <EmptyState
              accent={accent}
              hasItems={items.length > 0}
              onSubmit={onOpenSubmit}
            />
          }
          contentContainerStyle={
            filtered.length === 0
              ? { flex: 1 }
              : { paddingVertical: 8, paddingHorizontal: 16 }
          }
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              accent={accent}
              accentSoft={accentSoft}
              onUpvote={onUpvote}
              onOpenId={onOpenDetail}
            />
          )}
        />
      )}
    </View>
  )
}

interface FilterChipProps {
  readonly value: StatusFilterValue
  readonly label: string
  readonly count: number
  readonly active: boolean
  readonly accent: string
  readonly dotColor?: string
  readonly onPress: (value: StatusFilterValue) => void
}

function FilterChip({
  value,
  label,
  count,
  active,
  accent,
  dotColor,
  onPress,
}: FilterChipProps) {
  const handlePress = useCallback(() => onPress(value), [value, onPress])
  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: accent, borderColor: accent }
          : styles.chipIdle,
      ]}
    >
      {dotColor ? (
        <View style={[styles.chipDot, { backgroundColor: dotColor }]} />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
      <View
        style={[
          styles.chipCount,
          active ? styles.chipCountActive : styles.chipCountIdle,
        ]}
      >
        <Text
          style={[
            styles.chipCountText,
            active ? { color: accent } : { color: '#6b7280' },
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  )
}

interface RequestCardProps {
  readonly item: RequestSummary
  readonly accent: string
  readonly accentSoft: string
  readonly onUpvote: (item: RequestSummary) => void
  readonly onOpenId: (requestId: string) => void
}

function RequestCard({
  item,
  accent,
  accentSoft,
  onUpvote,
  onOpenId,
}: RequestCardProps) {
  const scale = useRef(new Animated.Value(1)).current
  const handleOpen = useCallback(() => onOpenId(item.id), [item.id, onOpenId])
  const handleUpvote = useCallback(() => onUpvote(item), [item, onUpvote])

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 60,
      bounciness: 0,
    }).start()
  }
  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 60,
      bounciness: 6,
    }).start()
  }

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <Pressable
        onPress={handleOpen}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.cardInner}
      >
        <View style={styles.cardLeft}>
          <Pressable
            style={[
              styles.upvote,
              item.viewerHasUpvoted
                ? { backgroundColor: accent, borderColor: accent }
                : { backgroundColor: accentSoft, borderColor: 'transparent' },
            ]}
            onPress={handleUpvote}
            hitSlop={4}
          >
            <Text
              style={[
                styles.upvoteArrow,
                { color: item.viewerHasUpvoted ? '#fff' : accent },
              ]}
            >
              ▲
            </Text>
            <Text
              style={[
                styles.upvoteCount,
                { color: item.viewerHasUpvoted ? '#fff' : accent },
              ]}
            >
              {item.upvoteCount}
            </Text>
          </Pressable>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.cardMeta}>
            <StatusPill status={item.status} />
            {item.viewerIsFollowing ? (
              <View style={styles.followingPill}>
                <Text style={styles.followingPillText}>✓ Following</Text>
              </View>
            ) : null}
            <Text style={styles.cardMetaText}>
              {item.followerCount}{' '}
              {item.followerCount === 1 ? 'follower' : 'followers'}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

interface EmptyStateProps {
  readonly accent: string
  readonly hasItems: boolean
  readonly onSubmit: () => void
}

function EmptyState({ accent, hasItems, onSubmit }: EmptyStateProps) {
  if (hasItems) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🔍</Text>
        <Text style={styles.emptyTitle}>Nothing in this filter</Text>
        <Text style={styles.emptyBody}>Try “All” to see every suggestion.</Text>
      </View>
    )
  }
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>💡</Text>
      <Text style={styles.emptyTitle}>No suggestions yet</Text>
      <Text style={styles.emptyBody}>
        Be the first to share an idea — what would make this app better?
      </Text>
      <Pressable
        style={[styles.emptyCta, { backgroundColor: accent }]}
        onPress={onSubmit}
      >
        <Text style={styles.emptyCtaText}>Share an idea</Text>
      </Pressable>
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  headerSubtitle: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  newBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  newBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 100,
    borderWidth: 1,
    gap: 6,
  },
  chipIdle: { backgroundColor: '#fff', borderColor: '#e5e7eb' },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  chipCount: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountIdle: { backgroundColor: '#f3f4f6' },
  chipCountActive: { backgroundColor: '#fff' },
  chipCountText: { fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 14,
  },
  cardLeft: { paddingTop: 2 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111', lineHeight: 20 },
  cardDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  cardMetaText: { fontSize: 11, color: '#9ca3af' },

  upvote: {
    width: 52,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  upvoteArrow: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  upvoteCount: { fontSize: 14, fontWeight: '700' },

  followingPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#111',
  },
  followingPillText: { fontSize: 10, color: '#fff', fontWeight: '600' },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  emptyBody: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
