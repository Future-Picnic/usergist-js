/**
 * Presentational suggestion detail: body, team response, comments slot and
 * the vote/follow action bar. Theme colours only. DetailView owns loading
 * and the optimistic vote/follow calls.
 */
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Request as RequestDetailDto } from '@usergist/sdk-core/mobile'
import { CONTENT_MAX_WIDTH } from '../SurfaceControls.js'
import { surfaceTokens, withAlpha, type ResolvedTheme } from '../theme.js'
import { StatusPill } from './StatusPill.js'

export interface DetailContentProps {
  readonly theme: ResolvedTheme
  readonly data: RequestDetailDto
  readonly onUpvote: () => void
  readonly onFollow: () => void
  readonly comments: React.ReactNode
  readonly bottomInset?: number
}

export function DetailContent({ theme, data, onUpvote, onFollow, comments, bottomInset = 0 }: DetailContentProps) {
  const tokens = surfaceTokens(theme)
  const text = { color: theme.colors.text, fontFamily: theme.fontFamily }
  const sub = { color: theme.colors.subtext, fontFamily: theme.fontFamily }
  const radius = Math.min(theme.radius, 16)
  const voted = data.viewerHasUpvoted
  const following = data.viewerIsFollowing

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive" contentContainerStyle={styles.body}>
        <View style={styles.measure}>
          <StatusPill status={data.status} />
          <Text accessibilityRole="header" style={[styles.title, text]}>{data.title}</Text>
          <View style={styles.stats}>
            <Text accessible accessibilityLabel={`${data.upvoteCount} upvotes`} testID="request-detail-upvote-count"
              style={[styles.stat, sub]}>
              <Text style={[styles.statValue, text]}>{data.upvoteCount}</Text> {data.upvoteCount === 1 ? 'upvote' : 'upvotes'}
            </Text>
            <Text accessible accessibilityLabel={`${data.followerCount} followers`} testID="request-detail-follower-count"
              style={[styles.stat, sub]}>
              <Text style={[styles.statValue, text]}>{data.followerCount}</Text> {data.followerCount === 1 ? 'follower' : 'followers'}
            </Text>
          </View>

          <Text style={[styles.description, text]}>{data.description}</Text>

          {data.devResponse ? (
            <View style={[styles.response, { backgroundColor: tokens.tint, borderRadius: radius }]}>
              <Text style={[styles.responseLabel, { color: theme.colors.primary, fontFamily: theme.fontFamily }]}>
                Update from the team
              </Text>
              <Text style={[styles.responseBody, text]}>{data.devResponse}</Text>
            </View>
          ) : (
            <View style={[styles.response, { backgroundColor: tokens.fill, borderRadius: radius }]}>
              <Text style={[styles.responseLabel, text]}>No update yet</Text>
              <Text style={[styles.responseBody, sub]}>
                Follow this suggestion to hear when the team posts an update.
              </Text>
            </View>
          )}

          {comments}
        </View>
      </ScrollView>

      <View style={[styles.actionBar, {
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingBottom: Math.max(bottomInset, 12),
      }]}>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: voted }}
            accessibilityLabel={voted ? 'Remove request vote' : 'Upvote request'}
            testID="request-detail-vote"
            onPress={onUpvote}
            style={({ pressed }) => [styles.action, {
              backgroundColor: voted ? theme.colors.primary : tokens.tint,
              opacity: pressed ? 0.82 : 1,
            }]}
          >
            <View style={[styles.chevron, { borderColor: voted ? tokens.onPrimary : theme.colors.primary }]} />
            <Text style={[styles.actionLabel, {
              color: voted ? tokens.onPrimary : theme.colors.primary, fontFamily: theme.fontFamily,
            }]}>
              {voted ? `Upvoted, ${data.upvoteCount}` : `Upvote, ${data.upvoteCount}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: following }}
            accessibilityLabel={following ? 'Unfollow request' : 'Follow request'}
            testID="request-detail-follow"
            onPress={onFollow}
            style={({ pressed }) => [styles.action, styles.followAction, {
              borderColor: following ? withAlpha(theme.colors.text, 0.16) : theme.colors.border,
              backgroundColor: following ? tokens.fill : pressed ? tokens.fill : 'transparent',
            }]}
          >
            <Text style={[styles.actionLabel, text]}>{following ? 'Following' : 'Follow'}</Text>
          </Pressable>
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3, marginTop: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  stat: { fontSize: 15 },
  statValue: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  description: { marginTop: 18, fontSize: 16, lineHeight: 24 },
  response: { marginTop: 24, padding: 16, gap: 6 },
  responseLabel: { fontSize: 15, fontWeight: '700' },
  responseBody: { fontSize: 15, lineHeight: 22 },
  actionBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  action: {
    flex: 1, minHeight: 48, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  followAction: { borderWidth: 1.5 },
  chevron: { width: 8, height: 8, borderLeftWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }], marginTop: 4 },
  actionLabel: { fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
})
