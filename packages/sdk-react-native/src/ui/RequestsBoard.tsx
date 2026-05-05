import * as React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type {
  RequestSummary,
  RequestStatus,
} from '@ritmus/sdk-core'
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

export interface RequestsBoardProps {
  readonly visible: boolean
  readonly onClose: () => void
  readonly onSelect: (requestId: string) => void
  readonly onSubmitNew: () => void
  readonly accentColor?: string
}

export function RequestsBoard({
  visible,
  onClose,
  onSelect,
  onSubmitNew,
  accentColor = '#6C5CE7',
}: RequestsBoardProps) {
  const [items, setItems] = React.useState<ReadonlyArray<RequestSummary>>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const load = React.useCallback(
    async (reset = false) => {
      setLoading(true)
      try {
        const result = await Ritmus.getRequests({
          sort: 'top',
          q: search.trim().length > 0 ? search.trim() : undefined,
          cursor: reset ? null : cursor,
          limit: 20,
        })
        setItems((prev) => (reset ? result.items : [...prev, ...result.items]))
        setCursor(result.nextCursor)
      } finally {
        setLoading(false)
      }
    },
    [cursor, search],
  )

  React.useEffect(() => {
    if (visible) {
      void load(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, search])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.headerAction, { color: accentColor }]}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Feature requests</Text>
          <Pressable onPress={onSubmitNew} hitSlop={10}>
            <Text style={[styles.headerAction, { color: accentColor }]}>New</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search…"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />

        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          onEndReached={() => {
            if (cursor && !loading) void load(false)
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>No requests yet — be the first!</Text>
            ) : null
          }
          ListFooterComponent={
            loading ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={accentColor} />
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.description} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={styles.meta}>
                  {item.upvoteCount} upvotes · {item.followerCount} followers
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  { borderColor: STATUS_COLOR[item.status] + '88', backgroundColor: STATUS_COLOR[item.status] + '22' },
                ]}
              >
                <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
            </Pressable>
          )}
        />
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
  headerAction: { fontSize: 15 },
  search: {
    margin: 16,
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 15, fontWeight: '500', color: '#111' },
  description: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: 12,
  },
  statusText: { fontSize: 11, fontWeight: '500' },
  empty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 32 },
})
