// ============================================================
// Feature requests (5th pillar) — public types
// ============================================================
// Shared between API, dashboard, web-roadmap, and SDKs.
// All shapes are `readonly`. Identity uses anonymousId + externalId
// as on every other SDK payload — no new identity types here.

export type RequestStatus =
  | 'under_review'
  | 'planned'
  | 'in_progress'
  | 'shipped'
  | 'declined'

export type RequestFollowSource = 'upvote_auto' | 'manual'

export type RequestSort = 'top' | 'newest' | 'recently_updated'

export type RequestPersonalFilter = 'submitted' | 'upvoted' | 'following'

// Event-name constants for the 7 events emitted by the request engine.
// All flow through services/ingest.ts and become segmentable like every
// other event (no segment-engine code changes needed).
export const REQUEST_SUBMITTED_EVENT_NAME = '$request_submitted' as const
export const REQUEST_UPVOTED_EVENT_NAME = '$request_upvoted' as const
export const REQUEST_UNUPVOTED_EVENT_NAME = '$request_unupvoted' as const
export const REQUEST_FOLLOWED_EVENT_NAME = '$request_followed' as const
export const REQUEST_UNFOLLOWED_EVENT_NAME = '$request_unfollowed' as const
export const REQUEST_STATUS_CHANGED_EVENT_NAME = '$request_status_changed' as const
export const REQUEST_RESPONDED_EVENT_NAME = '$request_responded' as const
export const REQUEST_COMMENTED_EVENT_NAME = '$request_commented' as const
export const REQUEST_COMMENT_EDITED_EVENT_NAME = '$request_comment_edited' as const
export const REQUEST_COMMENT_DELETED_EVENT_NAME = '$request_comment_deleted' as const

// ---------- core domain shapes ----------

/**
 * A feature request with viewer-relative state attached. Returned from
 * detail and list endpoints; `viewer*` fields are computed server-side
 * from the caller's identity.
 */
export interface Request {
  readonly id: string
  readonly appId: string
  readonly title: string
  readonly description: string
  readonly status: RequestStatus
  readonly devResponse: string | null
  readonly upvoteCount: number
  readonly followerCount: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly statusChangedAt: string
  readonly lastRespondedAt: string | null
  readonly viewerHasUpvoted: boolean
  readonly viewerIsFollowing: boolean
  readonly viewerIsSubmitter: boolean
}

/** Compact summary used in list views and search typeahead. */
export interface RequestSummary {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly status: RequestStatus
  readonly upvoteCount: number
  readonly followerCount: number
  readonly createdAt: string
  readonly statusChangedAt: string
  readonly viewerHasUpvoted: boolean
  readonly viewerIsFollowing: boolean
}

/** Search-as-you-type result; the SDK shows up to 5. */
export interface RequestSearchResult {
  readonly id: string
  readonly title: string
  readonly status: RequestStatus
  readonly upvoteCount: number
}

// ---------- toggle return shapes ----------

/** Returned from POST/DELETE /v1/sdk/requests/:id/votes. */
export interface RequestVote {
  readonly requestId: string
  readonly upvoted: boolean
  readonly followed: boolean
  readonly upvoteCount: number
  readonly followerCount: number
}

/** Returned from POST/DELETE /v1/sdk/requests/:id/follows. */
export interface RequestFollow {
  readonly requestId: string
  readonly following: boolean
  readonly followerCount: number
  readonly source: RequestFollowSource
}

// ---------- request payloads ----------

export interface GetRequestsOptions {
  readonly sort?: RequestSort
  readonly statuses?: ReadonlyArray<RequestStatus>
  readonly mine?: RequestPersonalFilter
  readonly q?: string
  readonly cursor?: string | null
  readonly limit?: number
}

export interface GetRequestsResult {
  readonly items: ReadonlyArray<RequestSummary>
  readonly nextCursor: string | null
}

export interface SubmitRequestPayload {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly title: string
  readonly description: string
}

export interface RequestVotePayload {
  readonly anonymousId: string
  readonly externalId?: string | null
}

export interface RequestFollowPayload {
  readonly anonymousId: string
  readonly externalId?: string | null
}

// ---------- dashboard shapes ----------

export interface RequestDetail extends Request {
  readonly submitterAnonymousId: string
  readonly submitterExternalId: string | null
  readonly hidden: boolean
}

export interface RequestUpvoterSegmentBreakdown {
  readonly requestId: string
  readonly totalUpvoters: number
  readonly segments: ReadonlyArray<{
    readonly segmentId: string
    readonly segmentName: string
    readonly count: number
    readonly percentage: number
  }>
}

export type RequestTimelineEntryKind =
  | 'submitted'
  | 'upvote_burst'
  | 'follow_burst'
  | 'status_changed'
  | 'responded'

export interface RequestTimelineEntry {
  readonly kind: RequestTimelineEntryKind
  readonly at: string
  readonly count?: number
  readonly fromStatus?: RequestStatus
  readonly toStatus?: RequestStatus
  readonly responseExcerpt?: string
}

export interface RequestAnalytics {
  readonly submissions: ReadonlyArray<{ readonly date: string; readonly count: number }>
  readonly upvotes: ReadonlyArray<{ readonly date: string; readonly count: number }>
  readonly follows: ReadonlyArray<{ readonly date: string; readonly count: number }>
  readonly statusDistribution: Record<RequestStatus, number>
  readonly devResponseRate: number
  readonly medianResponseHours: number | null
  readonly leaderboard: ReadonlyArray<{
    readonly anonymousId: string
    readonly externalId: string | null
    readonly submissions: number
    readonly upvotes: number
  }>
}

export interface UpdateRequestStatusRequest {
  readonly status: RequestStatus
  readonly responseAppend?: string
}

export interface UpdateRequestResponseRequest {
  readonly body: string
}

export interface UpdateRequestModerationRequest {
  readonly hidden: boolean
}

export interface MergeRequestsRequest {
  readonly canonicalId: string
  readonly duplicateIds: ReadonlyArray<string>
}

export interface BulkUpdateStatusRequest {
  readonly ids: ReadonlyArray<string>
  readonly status: RequestStatus
}

export interface ListRequestsQuery {
  readonly sort?: RequestSort
  readonly status?: RequestStatus | ReadonlyArray<RequestStatus>
  readonly filter?: RequestPersonalFilter
  readonly anonymousId?: string
  readonly q?: string
  readonly hidden?: boolean
  readonly page?: number
  readonly limit?: number
}

// ---------- settings ----------

export interface RequestBranding {
  readonly logoUrl?: string | null
  readonly accentColor?: string | null
  readonly coverImageUrl?: string | null
  readonly introCopy?: string | null
}

export interface RequestNotificationRules {
  readonly transitions?: Record<string, boolean>
  readonly responseFirst?: boolean
  readonly responseEdit?: boolean
  readonly templateOverrides?: {
    readonly statusChange?: string
    readonly response?: string
  }
}

export interface RequestSettings {
  readonly appId: string
  readonly enabled: boolean
  readonly entryLabel: string
  readonly viewSegmentId: string | null
  readonly submitSegmentId: string | null
  readonly publicRoadmapEnabled: boolean
  readonly publicSlug: string | null
  readonly branding: RequestBranding
  readonly notificationRules: RequestNotificationRules
}

export interface UpdateRequestSettingsRequest {
  readonly enabled?: boolean
  readonly entryLabel?: string
  readonly viewSegmentId?: string | null
  readonly submitSegmentId?: string | null
  readonly publicRoadmapEnabled?: boolean
  readonly publicSlug?: string | null
  readonly branding?: RequestBranding
  readonly notificationRules?: RequestNotificationRules
}

// ---------- public web roadmap shapes ----------

/** Public-safe request summary (no submitter identity). */
export interface RequestPublicSummary {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly status: RequestStatus
  readonly upvoteCount: number
  readonly followerCount: number
  readonly createdAt: string
  readonly statusChangedAt: string
}

export interface RequestPublicDetail extends RequestPublicSummary {
  readonly devResponse: string | null
  readonly lastRespondedAt: string | null
}

export interface RequestPublicBranding {
  readonly entryLabel: string
  readonly appName: string
  readonly branding: RequestBranding
  readonly fallbackInstallUrl: string | null
}

// ---------- SDK push payload ----------

/** Carried inside push/in-app message payloads when status changes. */
export interface RequestStatusChangedNotice {
  readonly requestId: string
  readonly title: string
  readonly oldStatus: RequestStatus
  readonly newStatus: RequestStatus
  readonly devResponseExcerpt?: string
  readonly receivedVia: 'push' | 'inapp'
}

// ---------- comments ----------

export interface RequestComment {
  readonly id: string
  readonly requestId: string
  readonly body: string
  readonly authorAnonymousId: string
  readonly authorExternalId: string | null
  readonly viewerIsAuthor: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PostCommentPayload {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly body: string
}

export interface EditCommentPayload {
  readonly anonymousId: string
  readonly body: string
}

/** Host-app callbacks registered via `setRequestsHandlers`. */
export interface RequestsHandlers {
  readonly onSubmit?: (request: Request) => void
  readonly onVote?: (vote: RequestVote) => void
  readonly onFollow?: (follow: RequestFollow) => void
  readonly onStatusChanged?: (notice: RequestStatusChangedNotice) => void
}
