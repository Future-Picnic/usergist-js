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
import type { RequestStatus, RequestSummary } from '@usergist/sdk-core/mobile'
import { UserGist } from '../../UserGist.js'
import {
  STATUS_COLOR,
  STATUS_KEYS,
  STATUS_LABEL,
  applyOptimisticVote,
  useRequestsTheme,
  type Branding,
  type StatusFilterValue,
} from './shared.js'
import { StatusPill } from './StatusPill.js'
import { CONTENT_MAX_WIDTH, SurfaceClose, SurfaceHeader, SurfaceNext } from '../SurfaceControls.js'
import { surfaceTokens, type ResolvedTheme } from '../theme.js'

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
  const theme = useRequestsTheme(branding)

  const [items, setItems] = useState<ReadonlyArray<RequestSummary>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const result = await UserGist.getRequests({ sort: 'top', limit: 50 })
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

  const onUpvote = useCallback(async (item: RequestSummary) => {
    const next = !item.viewerHasUpvoted
    setItems((prev) =>
      prev.map((r) => (r.id === item.id ? applyOptimisticVote(r, next) : r)),
    )
    try {
      await UserGist.voteOnRequest(item.id, next)
    } catch (e) {
      setItems((prev) => prev.map((r) => (r.id === item.id ? item : r)))
      Alert.alert('Vote failed', String(e))
    }
  }, [])

  return (
    <BoardContent
      theme={theme}
      title={branding.entryLabel}
      items={items}
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => { void load(true) }}
      onClose={onClose}
      onOpenDetail={onOpenDetail}
      onOpenSubmit={onOpenSubmit}
      onUpvote={(item) => { void onUpvote(item) }}
    />
  )
}

export interface BoardContentProps {
  readonly theme: ResolvedTheme
  readonly title: string
  readonly items: ReadonlyArray<RequestSummary>
  readonly loading: boolean
  readonly refreshing: boolean
  readonly onRefresh: () => void
  readonly onClose: () => void
  readonly onOpenDetail: (requestId: string) => void
  readonly onOpenSubmit: () => void
  readonly onUpvote: (item: RequestSummary) => void
}

/** Presentational board: header, status filters, list and empty states. */
export function BoardContent({
  theme, title, items, loading, refreshing, onRefresh, onClose, onOpenDetail, onOpenSubmit, onUpvote,
}: BoardContentProps) {
  const accent = theme.colors.primary
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')

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

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <SurfaceHeader
          leading={<SurfaceClose label="Close requests board" testID="requests-board-close" onPress={onClose}
            color={theme.colors.text} />}
          center={
            <>
              <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]}>
                {title}
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
                {items.length} {items.length === 1 ? 'idea' : 'ideas'}
              </Text>
            </>
          }
          trailing={<SurfaceNext onPress={onOpenSubmit} disabled={false} compact theme={theme}
            label="New idea" testID="requests-board-create" />}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        <FilterChip value="all" label="All" count={items.length}
          active={statusFilter === 'all'} onPress={setStatusFilter} theme={theme} />
        {STATUS_KEYS.map((s) => {
          const count = statusCounts[s]
          if (count === 0) return null
          return (
            <FilterChip key={s} value={s} label={STATUS_LABEL[s]} count={count}
              active={statusFilter === s} onPress={setStatusFilter} theme={theme} dotColor={STATUS_COLOR[s]} />
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
          }
          ListEmptyComponent={
            <EmptyState theme={theme} hasItems={items.length > 0} onSubmit={onOpenSubmit} />
          }
          contentContainerStyle={
            filtered.length === 0 ? { flexGrow: 1 } : styles.list
          }
          renderItem={({ item }) => (
            <RequestCard item={item} theme={theme} onUpvote={onUpvote} onOpenId={onOpenDetail} />
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
  readonly theme: ResolvedTheme
  readonly dotColor?: string
  readonly onPress: (value: StatusFilterValue) => void
}

function FilterChip({ value, label, count, active, theme, dotColor, onPress }: FilterChipProps) {
  const handlePress = useCallback(() => onPress(value), [value, onPress])
  const tokens = surfaceTokens(theme)
  const fg = active ? theme.colors.primary : theme.colors.text
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
      style={[styles.chip, {
        backgroundColor: active ? tokens.tint : 'transparent',
        borderColor: active ? theme.colors.primary : theme.colors.border,
      }]}
    >
      {dotColor ? <View style={[styles.chipDot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.chipText, { color: fg, fontFamily: theme.fontFamily }]}>{label}</Text>
      <Text style={[styles.chipCount, { color: active ? theme.colors.primary : theme.colors.subtext, fontFamily: theme.fontFamily }]}>
        {count}
      </Text>
    </Pressable>
  )
}

interface RequestCardProps {
  readonly item: RequestSummary
  readonly theme: ResolvedTheme
  readonly onUpvote: (item: RequestSummary) => void
  readonly onOpenId: (requestId: string) => void
}

function RequestCard({ item, theme, onUpvote, onOpenId }: RequestCardProps) {
  const scale = useRef(new Animated.Value(1)).current
  const handleOpen = useCallback(() => onOpenId(item.id), [item.id, onOpenId])
  const handleUpvote = useCallback(() => onUpvote(item), [item, onUpvote])
  const tokens = surfaceTokens(theme)
  const accent = theme.colors.primary
  const voted = item.viewerHasUpvoted

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, speed: 60, bounciness: 0 }).start()
  }
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 4 }).start()
  }

  return (
    <Animated.View style={[styles.card, {
      borderColor: theme.colors.border,
      borderRadius: Math.min(theme.radius, 18),
      transform: [{ scale }],
    }]}>
      <Pressable
        accessibilityLabel={`Open request ${item.title}`}
        onPress={handleOpen}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.cardInner}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: voted }}
          accessibilityLabel={`${voted ? 'Remove vote from' : 'Upvote'} ${item.title}`}
          style={[styles.upvote, {
            backgroundColor: voted ? accent : tokens.tint,
            borderRadius: Math.min(theme.radius, 12),
          }]}
          onPress={handleUpvote}
          hitSlop={4}
        >
          <View style={[styles.upvoteChevron, { borderColor: voted ? tokens.onPrimary : accent }]} />
          <Text style={[styles.upvoteCount, { color: voted ? tokens.onPrimary : accent, fontFamily: theme.fontFamily }]}>
            {item.upvoteCount}
          </Text>
        </Pressable>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.cardDescription, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.cardMeta}>
            <StatusPill status={item.status} />
            <Text style={[styles.cardMetaText, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]}>
              {item.viewerIsFollowing ? 'Following' : `${item.followerCount} ${item.followerCount === 1 ? 'follower' : 'followers'}`}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

interface EmptyStateProps {
  readonly theme: ResolvedTheme
  readonly hasItems: boolean
  readonly onSubmit: () => void
}

function EmptyState({ theme, hasItems, onSubmit }: EmptyStateProps) {
  const titleStyle = [styles.emptyTitle, { color: theme.colors.text, fontFamily: theme.fontFamily }]
  const bodyStyle = [styles.emptyBody, { color: theme.colors.subtext, fontFamily: theme.fontFamily }]
  if (hasItems) {
    return (
      <View style={styles.empty}>
        <Text style={titleStyle}>Nothing with this status</Text>
        <Text style={bodyStyle}>Choose All to see every suggestion.</Text>
      </View>
    )
  }
  return (
    <View style={styles.empty}>
      <Text style={titleStyle}>No suggestions yet</Text>
      <Text style={bodyStyle}>Share the first idea for making this app better.</Text>
      <View style={styles.emptyCta}>
        <SurfaceNext onPress={onSubmit} disabled={false} theme={theme} label="Share an idea" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 1, fontVariant: ['tabular-nums'] },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, gap: 6,
  },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipCount: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  list: { paddingVertical: 4, paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: CONTENT_MAX_WIDTH + 32, alignSelf: 'center' },
  card: { borderWidth: 1, marginBottom: 10 },
  cardInner: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 14 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', lineHeight: 21 },
  cardDescription: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 13 },
  upvote: { width: 52, minHeight: 56, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 4 },
  upvoteChevron: { width: 9, height: 9, borderLeftWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }], marginTop: 4 },
  upvoteCount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  emptyCta: { marginTop: 20, minWidth: 200 },
})
