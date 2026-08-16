/**
 * Shared constants, helpers, and hooks for the requests UI.
 * Internal to the SDK — not exported from the package root.
 */
import { useEffect, useState } from 'react'
import type {
  Request as RequestDto,
  RequestStatus,
  RequestSummary,
} from '@usergist/sdk-core'
import { UserGist } from '../../UserGist.js'

export const STATUS_COLOR: Record<RequestStatus, string> = {
  under_review: '#9CA3AF',
  planned: '#3B82F6',
  in_progress: '#F59E0B',
  shipped: '#22C55E',
  declined: '#EF4444',
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  under_review: 'Under review',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}

export const STATUS_KEYS: ReadonlyArray<RequestStatus> = Object.keys(
  STATUS_LABEL,
) as RequestStatus[]

export const FALLBACK_ACCENT = '#5B4BFF'

export type StatusFilterValue = RequestStatus | 'all'

export interface Branding {
  readonly entryLabel: string
  readonly accentColor: string
  readonly logoUrl: string | null
  readonly introCopy: string | null
}

export const DEFAULT_BRANDING: Branding = {
  entryLabel: 'Suggestions',
  accentColor: FALLBACK_ACCENT,
  logoUrl: null,
  introCopy: null,
}

let cachedBranding: Branding | null = null

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(
    cachedBranding ?? DEFAULT_BRANDING,
  )

  useEffect(() => {
    if (cachedBranding) return
    void UserGist.getRequestBranding().then((b) => {
      if (!b) return
      const next: Branding = {
        entryLabel: b.entryLabel || DEFAULT_BRANDING.entryLabel,
        accentColor: b.accentColor || DEFAULT_BRANDING.accentColor,
        logoUrl: b.logoUrl,
        introCopy: b.introCopy,
      }
      cachedBranding = next
      setBranding(next)
    })
  }, [])

  return branding
}

/**
 * Spec §9: upvoting auto-creates a follow; un-upvoting does NOT remove
 * the follow. Encoded once so list + detail can't drift apart.
 */
export function applyOptimisticVote<
  T extends Pick<
    RequestSummary,
    | 'viewerHasUpvoted'
    | 'viewerIsFollowing'
    | 'upvoteCount'
    | 'followerCount'
  >,
>(item: T, vote: boolean): T {
  return {
    ...item,
    viewerHasUpvoted: vote,
    viewerIsFollowing: vote ? true : item.viewerIsFollowing,
    upvoteCount: Math.max(0, item.upvoteCount + (vote ? 1 : -1)),
    followerCount:
      vote && !item.viewerIsFollowing
        ? item.followerCount + 1
        : item.followerCount,
  }
}

export function applyOptimisticFollow<
  T extends Pick<RequestDto, 'viewerIsFollowing' | 'followerCount'>,
>(item: T, follow: boolean): T {
  if (item.viewerIsFollowing === follow) return item
  return {
    ...item,
    viewerIsFollowing: follow,
    followerCount: Math.max(0, item.followerCount + (follow ? 1 : -1)),
  }
}
