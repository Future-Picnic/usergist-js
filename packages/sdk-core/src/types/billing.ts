export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'

export type SubscriptionSource = 'paddle' | 'internal'

export interface BillingPlan {
  readonly id: string
  readonly name: string
  readonly paddleProductId: string | null
  readonly paddleBasePriceId: string | null
  readonly paddleOveragePriceId: string | null
  readonly baseAmountCents: number
  readonly currency: string
  readonly includedMau: number
  readonly overagePer1kCents: number
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
}

export interface BillingUsage {
  readonly mau: number
  readonly includedMau: number | null
  readonly overUnits: number
  readonly projectedOverageCents: number
  readonly unlimited: boolean
}

export interface BillingCheckoutRequest {
  readonly planId: string
}

export interface BillingCheckoutResponse {
  readonly customerId: string
  readonly items: ReadonlyArray<{ readonly priceId: string; readonly quantity: number }>
  readonly customData: { readonly workspace_id: string }
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
