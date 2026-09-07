import type {
  BillingAccessState,
  BillingPeriod,
  BillingPlan,
  BillingTrial,
  Subscription,
  SubscriptionStatus,
} from './billing.js'
import type { WorkspaceRole } from './workspace.js'

export type AdminGrantStatus = 'active' | 'expired' | 'revoked'

export type GlobalFeatureFlagKey = 'onboarding_finish_later'

export interface GlobalFeatureFlag {
  readonly key: GlobalFeatureFlagKey
  readonly enabled: boolean
  readonly description: string
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface ProductFeatureFlags {
  readonly portalContent: boolean
  readonly onboardingFinishLater: boolean
}

export interface UpdateGlobalFeatureFlagRequest {
  readonly enabled: boolean
}

export interface WorkspacePlanGrant {
  readonly id: string
  readonly workspaceId: string
  readonly planId: string
  readonly startsAt: string
  readonly endsAt: string
  readonly reason: string
  readonly createdByUserId: string
  readonly createdByEmail: string | null
  readonly revokedAt: string | null
  readonly revokedByUserId: string | null
  readonly revokedByEmail: string | null
  readonly revokeReason: string | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: AdminGrantStatus
}

export interface EffectivePlanAccess {
  readonly billingPlan: BillingPlan | null
  readonly subscription: Subscription | null
  readonly activeGrant: WorkspacePlanGrant | null
  readonly grantPlan: BillingPlan | null
  readonly effectivePlan: BillingPlan | null
  readonly source: 'subscription' | 'grant' | 'none'
  readonly state: BillingAccessState
  readonly reason: string | null
  readonly canCollect: boolean
  readonly canDeliver: boolean
  readonly canMutateProduct: boolean
  readonly canManageBilling: boolean
  readonly activeAppLimit: number | null
  readonly deadlineAt: string | null
  readonly trial: BillingTrial | null
}

export interface AdminSession {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name: string | null
  }
}

export type AdminDeletionKind = 'workspace' | 'dashboard_user'
export type AdminDeletionStatus = 'queued' | 'running' | 'failed' | 'completed'

export interface AdminDeletionJob {
  readonly id: string
  readonly kind: AdminDeletionKind
  readonly targetId: string
  readonly targetLabel: string
  readonly status: AdminDeletionStatus
  readonly attempts: number
  readonly error: string | null
  readonly requestedByEmail: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
}

export interface DeleteAdminWorkspaceRequest {
  readonly confirmationName: string
}

export interface DeleteAdminDashboardUserRequest {
  readonly confirmationEmail: string
}

export interface AdminDashboardUserSummary {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  readonly workosUserId: string | null
  readonly isSuperAdmin: boolean
  readonly deletionPending: boolean
  readonly ownedWorkspaceCount: number
  readonly membershipCount: number
  readonly createdAt: string
}

export interface AdminDashboardUserListRequest {
  readonly search?: string
  readonly cursor?: string
  readonly limit?: number
}

export interface AdminDashboardUserListResponse {
  readonly users: ReadonlyArray<AdminDashboardUserSummary>
  readonly nextCursor: string | null
}

export interface AdminCustomerSummary {
  readonly workspaceId: string
  readonly name: string
  readonly slug: string
  readonly region: string
  readonly owner: {
    readonly userId: string
    readonly email: string
    readonly name: string | null
  }
  readonly memberCount: number
  readonly appCount: number
  readonly mau: number
  readonly subscriptionStatus: SubscriptionStatus | null
  readonly billingPlan: BillingPlan | null
  readonly effectivePlan: BillingPlan | null
  readonly activeGrant: WorkspacePlanGrant | null
  readonly accessState: BillingAccessState
  readonly accessDeadlineAt: string | null
  readonly createdAt: string
}

export interface AdminCustomerMember {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  readonly role: WorkspaceRole
  readonly joinedAt: string
}

export interface AdminCustomerApp {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly platforms: ReadonlyArray<string>
  readonly billingSuspendedAt: string | null
  readonly createdAt: string
}

export interface AdminBillingEvent {
  readonly id: string
  readonly eventType: string
  readonly receivedAt: string
  readonly processedAt: string | null
  readonly processingError: string | null
  readonly processingStatus: 'pending' | 'processing' | 'processed' | 'failed' | 'review_required'
  readonly attemptCount: number
}

export interface AdminBillingNotification {
  readonly id: string
  readonly kind: 'trial_ending' | 'trial_grace' | 'trial_suspended' | 'payment_past_due'
  readonly status: 'pending' | 'sent' | 'canceled' | 'dead_lettered'
  readonly attempts: number
  readonly referenceAt: string
  readonly sentAt: string | null
  readonly lastError: string | null
  readonly createdAt: string
}

export interface AdminActivityEntry {
  readonly id: string
  readonly workspaceId: string | null
  readonly workspaceName: string | null
  readonly actorEmail: string | null
  readonly action: string
  readonly targetType: string
  readonly targetId: string | null
  readonly payload: Record<string, unknown>
  readonly createdAt: string
}

export interface AdminCustomerDetail {
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly region: string
    readonly createdAt: string
  }
  readonly owner: AdminCustomerMember
  readonly members: ReadonlyArray<AdminCustomerMember>
  readonly apps: ReadonlyArray<AdminCustomerApp>
  readonly mau: number
  readonly access: EffectivePlanAccess
  readonly grantHistory: ReadonlyArray<WorkspacePlanGrant>
  readonly billingEvents: ReadonlyArray<AdminBillingEvent>
  readonly billingNotifications: ReadonlyArray<AdminBillingNotification>
  readonly billingPeriods: ReadonlyArray<BillingPeriod>
  readonly foundingOffer: {
    readonly code: string
    readonly slotNumber: number
    readonly status: 'reserved' | 'claimed' | 'expired'
    readonly reservedUntil: string | null
    readonly claimedAt: string | null
  } | null
  readonly recentActivity: ReadonlyArray<AdminActivityEntry>
}

export interface AdminCustomerListRequest {
  readonly search?: string
  readonly planId?: string
  readonly subscriptionStatus?: SubscriptionStatus | 'none'
  readonly grantStatus?: 'active' | 'expiring' | 'none'
  readonly cursor?: string
  readonly limit?: number
}

export interface AdminCustomerListResponse {
  readonly customers: ReadonlyArray<AdminCustomerSummary>
  readonly nextCursor: string | null
}

export interface CreateWorkspacePlanGrantRequest {
  readonly planId: string
  readonly durationDays?: number
  readonly endsAt?: string
  readonly reason: string
}

export interface ExtendWorkspacePlanGrantRequest {
  readonly endsAt: string
  readonly reason: string
  readonly expectedVersion: number
}

export interface RevokeWorkspacePlanGrantRequest {
  readonly reason: string
  readonly expectedVersion: number
}
