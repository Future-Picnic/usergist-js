import type { BillingInterval, BillingPriceKind } from '../types/billing.js'

export interface CommercialPlanDefinition {
  readonly id: 'usage'
  readonly name: string
  readonly publicSlug: string
  readonly description: string
  readonly priceKind: BillingPriceKind
  readonly selfServe: boolean
  readonly baseAmountCents: number
  readonly currency: 'USD'
  readonly includedMau: number
  readonly overagePer1kCents: number
  readonly appLimit: number | null
  readonly billingInterval: BillingInterval
  readonly sortOrder: number
  readonly accessRank: number
  readonly catalogVersion: number
}

export const COMMERCIAL_BILLING_PLANS: ReadonlyArray<CommercialPlanDefinition> = [
  {
    id: 'usage',
    name: 'UserGist',
    publicSlug: 'usage',
    description: 'All features. First 1,000 monthly active users free, then $5 per additional 1,000.',
    priceKind: 'fixed',
    selfServe: true,
    baseAmountCents: 0,
    currency: 'USD',
    includedMau: 1_000,
    overagePer1kCents: 500,
    appLimit: null,
    billingInterval: 'month',
    sortOrder: 10,
    accessRank: 10,
    catalogVersion: 2,
  },
]

export const BILLING_GRACE_DAYS = 7
export const FREE_MAU = 1_000
export const USAGE_PER_1K_CENTS = 500
// Retained only for historical subscription reconciliation.
export const STARTER_FOUNDING_OFFER_CODE = 'starter_founding_100'
export const STARTER_FOUNDING_CUSTOMER_LIMIT = 100
