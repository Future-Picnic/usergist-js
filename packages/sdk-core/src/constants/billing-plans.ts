import type { BillingInterval, BillingPriceKind } from '../types/billing.js'

export interface CommercialPlanDefinition {
  readonly id: 'starter' | 'pro' | 'scale'
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
    id: 'starter',
    name: 'Starter',
    publicSlug: 'starter',
    description: 'For small teams getting started with product feedback.',
    priceKind: 'fixed',
    selfServe: true,
    baseAmountCents: 1_999,
    currency: 'USD',
    includedMau: 1_000,
    overagePer1kCents: 200,
    appLimit: 1,
    billingInterval: 'month',
    sortOrder: 10,
    accessRank: 10,
    catalogVersion: 1,
  },
  {
    id: 'pro',
    name: 'Pro',
    publicSlug: 'pro',
    description: 'For growing products with multiple applications.',
    priceKind: 'fixed',
    selfServe: true,
    baseAmountCents: 4_900,
    currency: 'USD',
    includedMau: 25_000,
    overagePer1kCents: 100,
    appLimit: 3,
    billingInterval: 'month',
    sortOrder: 20,
    accessRank: 20,
    catalogVersion: 1,
  },
  {
    id: 'scale',
    name: 'Scale',
    publicSlug: 'scale',
    description: 'Contract pricing, usage, and application limits for larger organizations.',
    priceKind: 'custom',
    selfServe: false,
    baseAmountCents: 0,
    currency: 'USD',
    includedMau: 0,
    overagePer1kCents: 0,
    appLimit: null,
    billingInterval: 'month',
    sortOrder: 30,
    accessRank: 30,
    catalogVersion: 1,
  },
]

export const TRIAL_DAYS = 14
export const BILLING_GRACE_DAYS = 7
export const TRIAL_APP_LIMIT = 1
export const STARTER_FOUNDING_OFFER_CODE = 'starter_founding_100'
export const STARTER_FOUNDING_CUSTOMER_LIMIT = 100
