export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'

export type SubscriptionSource = 'paddle' | 'internal'

export type BillingPriceKind = 'fixed' | 'custom' | 'internal'
export type BillingInterval = 'month'
export type BillingAccessState =
  | 'trial_active'
  | 'trial_grace'
  | 'active'
  | 'past_due_grace'
  | 'scheduled_cancel'
  | 'suspended'
  | 'internal'

export type BillingChargeStatus =
  | 'pending'
  | 'submitted'
  | 'paid'
  | 'failed'
  | 'unknown'
  | 'waived'

export interface BillingPlan {
  readonly id: string
  readonly name: string
  readonly publicSlug: string | null
  readonly description: string
  readonly priceKind: BillingPriceKind
  readonly selfServe: boolean
  readonly baseAmountCents: number
  readonly currency: string
  readonly includedMau: number
  readonly overagePer1kCents: number
  readonly appLimit: number | null
  readonly billingInterval: BillingInterval
  readonly catalogVersion: number
  readonly unlimited: boolean
  readonly isActive: boolean
  readonly sortOrder: number
  readonly accessRank: number
  readonly adminGrantable: boolean
}

export interface Subscription {
  readonly id: string
  readonly workspaceId: string
  readonly paddleSubscriptionId: string | null
  readonly source: SubscriptionSource
  readonly planId: string
  readonly status: SubscriptionStatus
  readonly currentPeriodStart: string
  readonly currentPeriodEnd: string
  readonly cancelAtPeriodEnd: boolean
  readonly canceledAt: string | null
  readonly trialEndsAt: string | null
  readonly pendingPlanId: string | null
  readonly pendingPlanEffectiveAt: string | null
  readonly pendingPlanConfirmedAt: string | null
}

export interface BillingUsage {
  readonly periodStart: string | null
  readonly periodEnd: string | null
  readonly mau: number
  readonly includedMau: number | null
  readonly overUnits: number
  readonly overagePer1kCents: number
  readonly projectedOverageCents: number
  readonly projectedTotalCents: number
  readonly unlimited: boolean
  readonly finalized: boolean
  readonly chargeStatus: BillingChargeStatus | null
}

export interface BillingTrial {
  readonly startedAt: string | null
  readonly endsAt: string | null
  readonly graceEndsAt: string | null
}

export interface BillingOfferAvailability {
  readonly code: string
  readonly planId: string
  readonly total: number
  readonly claimed: number
  readonly reserved: number
  readonly remaining: number
}

export interface BillingCheckoutRequest {
  readonly planId: string
  readonly retainedAppIds?: ReadonlyArray<string>
}

export interface BillingCheckoutResponse {
  readonly checkoutSessionId: string
  readonly transactionId: string
  readonly expiresAt: string
}

export interface BillingChangePlanRequest {
  readonly planId: string
  readonly retainedAppIds?: ReadonlyArray<string>
}

export interface BillingChangePlanResponse {
  readonly planId: string
  readonly effectiveAt: string
  readonly prorationMode: 'immediate_prorated' | 'next_billing_period'
}

export interface BillingPeriod {
  readonly id: string
  readonly startsAt: string
  readonly endsAt: string
  readonly mau: number
  readonly includedMau: number
  readonly overageUnits: number
  readonly overageAmountCents: number
  readonly currency: string
  readonly status: 'open' | 'finalizing' | 'finalized' | 'billed' | 'review_required'
  readonly chargeStatus: BillingChargeStatus | null
}

export interface AdminWorkspaceSummary {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly created_at: string
  readonly owner_email: string | null
  readonly subscription: {
    readonly workspace_id: string
    readonly plan_id: string
    readonly status: SubscriptionStatus
    readonly source: SubscriptionSource
    readonly current_period_end: string
    readonly cancel_at_period_end: boolean
  } | null
  readonly mau: number
}
