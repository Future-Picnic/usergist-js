export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly region: string
  readonly timezone: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Workspace as returned from the authenticated `/v1/me` projection. */
export interface WorkspaceWithRole extends Workspace {
  readonly role: WorkspaceRole
}

export interface WorkspaceMember {
  readonly workspaceId: string
  readonly userId: string
  readonly email: string
  readonly name?: string | null
  readonly role: WorkspaceRole
  readonly createdAt: string
}

export interface WorkspaceInvite {
  readonly id: string
  readonly workspaceId: string
  readonly email: string
  readonly role: Exclude<WorkspaceRole, 'owner'>
  readonly deliveryStatus: 'pending' | 'sent' | 'failed'
  readonly expiresAt: string
  readonly createdAt: string
}

export interface AcceptWorkspaceInviteRequest {
  readonly token: string
}

export interface AcceptWorkspaceInviteResponse {
  readonly workspace: Workspace
  readonly role: WorkspaceRole
  readonly alreadyMember: boolean
}

export interface User {
  readonly id: string
  readonly email: string
  readonly name?: string | null
  readonly emailVerifiedAt?: string | null
  readonly createdAt: string
  readonly onboardingCompletedAt: string | null
  // Cross-workspace operator flag. Set on a tiny number of internal
  // accounts; surfaced so the dashboard can render the /admin
  // surface. SDK consumers never see this — it's only populated by
  // /v1/me which write-keys can't call.
  readonly isSuperAdmin?: boolean
}

export interface App {
  readonly setupMode?: 'sdk' | 'portal'
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly slug: string
  readonly platforms: ReadonlyArray<'ios' | 'android' | 'react-native' | 'expo' | 'flutter' | 'web'>
  readonly webConfig?: import('./web.js').WebAppConfig
  readonly piiAllowList: ReadonlyArray<string>
  readonly lifecycleEventsEnabled: boolean
  readonly billingSuspendedAt: string | null
  readonly onboarding: AppOnboarding
  readonly createdAt: string
  readonly updatedAt: string
}

export type OnboardingGoal = 'feedback' | 'survey' | 'inapp' | 'push' | 'requests'
export type OnboardingStatus = 'in_progress' | 'deferred' | 'completed'
export type OnboardingStep = 'connect' | 'verify' | 'experience' | 'push' | 'launch'
export type OnboardingPushChoice = 'pending' | 'configured' | 'skipped'

export interface AppOnboarding {
  readonly goal: OnboardingGoal | null
  readonly status: OnboardingStatus
  readonly step: OnboardingStep
  readonly pushChoice: OnboardingPushChoice
  readonly startedAt: string
  readonly deferredAt: string | null
  readonly completedAt: string | null
}

export interface OnboardingEvent {
  readonly name: '$app_open'
  readonly occurredAt: string
  readonly receivedAt: string
  readonly anonymousId: string
  readonly externalId: string | null
  readonly identityType: 'anonymous' | 'identified'
  readonly platform: string | null
  readonly sdkVersion: string | null
  readonly appVersion: string | null
}

export interface OnboardingFirstFeedback {
  readonly promptId: string
  readonly question: string
  readonly status: 'draft' | 'active' | 'paused' | 'archived'
  readonly createdAt: string
  readonly shownAt: string | null
  readonly responseAt: string | null
  readonly responseValue: number | string | ReadonlyArray<string> | null
  readonly responseAnonymousId: string | null
  readonly responseExternalId: string | null
  readonly lastDismissedAt: string | null
}

export interface AppOnboardingStatus extends AppOnboarding {
  readonly clientKeyAuthenticatedAt: string | null
  readonly environment: WriteKey['environment']
  readonly firstEvent: OnboardingEvent | null
  readonly firstAudienceUserCreated: boolean
  readonly firstFeedback: OnboardingFirstFeedback | null
  readonly pushCredentials: {
    readonly ios: boolean
    readonly android: boolean
  }
}

export interface UpdateAppOnboardingRequest {
  readonly action?:
    | 'resume'
    | 'defer'
    | 'create_first_feedback'
    | 'first_feedback_completed'
    | 'push_configured'
    | 'push_skipped'
    | 'complete'
  readonly step?: OnboardingStep
  readonly question?: string
}

export interface DeferCurrentUserOnboardingRequest {
  readonly action: 'defer'
}

export interface WriteKey {
  readonly id: string
  readonly appId: string
  readonly keyPrefix: string
  readonly environment: 'production' | 'staging' | 'development'
  readonly label?: string | null
  readonly revokedAt?: string | null
  readonly lastUsedAt?: string | null
  readonly createdAt: string
}

export interface CreatedWriteKey extends WriteKey {
  readonly plaintext: string // only returned on creation
}

export type ApiTokenScope = 'sdk:subjects' | 'push.transactional'

/**
 * Metadata for a workspace-scoped server credential. The plaintext secret is
 * deliberately absent and is only returned by the create endpoint.
 */
export interface ApiToken {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly tokenPrefix: string
  readonly scopes: ReadonlyArray<ApiTokenScope>
  readonly expiresAt: string
  readonly revokedAt: string | null
  readonly lastUsedAt: string | null
  readonly createdAt: string
}

export interface CreatedApiToken extends ApiToken {
  /** One-time server secret. Never ship this value inside a client app. */
  readonly plaintext: string
}

export interface CreateApiTokenRequest {
  readonly name: string
  readonly scopes: ReadonlyArray<ApiTokenScope>
  readonly expiresInDays?: number
}

/** App plus its first environment-specific write key, returned atomically. */
export interface CreatedApp extends App {
  readonly writeKey: CreatedWriteKey
}

/**
 * Request body for `POST /v1/apps/:appId/write-keys/:keyId/rotate`. The grace
 * window is how long the old key keeps authenticating before the API starts
 * returning 401 — gives SDK consumers a deploy window before the cutover.
 */
export interface RotateWriteKeyRequest {
  readonly graceSeconds?: number
}

/**
 * Response from a successful key rotation. The new key's plaintext is
 * returned ONCE and never again — operators must capture it on rotation.
 */
export interface RotateWriteKeyResponse {
  readonly newKey: CreatedWriteKey
  readonly oldKey: WriteKey
  readonly oldKeyExpiresAt: string
}
