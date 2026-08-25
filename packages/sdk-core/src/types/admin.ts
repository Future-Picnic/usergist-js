import type { BillingPlan, Subscription, SubscriptionStatus } from './billing.js'
import type { WorkspaceRole } from './workspace.js'

export type AdminGrantStatus = 'active' | 'expired' | 'revoked'

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
}

export interface AdminSession {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name: string | null
  }
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
  readonly createdAt: string
}

export interface AdminBillingEvent {
  readonly id: string
  readonly eventType: string
  readonly receivedAt: string
  readonly processedAt: string | null
  readonly processingError: string | null
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
