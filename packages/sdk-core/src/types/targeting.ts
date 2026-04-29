// ==========================================================
// Inline targeting spec — used by feedback prompts, surveys,
// and push campaigns. Wraps each pillar record with an
// `AudienceSpec` (who) + `TriggerSpec` (when).
//
// One condition kind in `AudienceCondition` is `segment`,
// which references saved Segments by id (so the dashboard
// suggests existing segments in that one branch). All other
// kinds are evaluated inline against user properties or
// recent event aggregates.
//
// `TriggerSpec` is a discriminated union with a shared base
// (`app_open`, `event`, `audience_join`). Pillar packages
// add extra kinds locally (e.g. push adds `manual` /
// `scheduled`) — engines `switch` on `kind` and treat
// unknowns as no-op.
// ==========================================================

import type { ComparisonOp } from './segment-dsl.js'

export type Platform = 'ios' | 'android' | 'web'

export type AudienceCombinator = 'all' | 'any'

export type AudienceMode = 'everyone' | 'match'

// -------------------- Audience conditions ----------------

export interface SegmentCondition {
  readonly kind: 'segment'
  readonly op: 'is' | 'is_not'
  readonly segmentIds: ReadonlyArray<string>
}

export interface CountryCondition {
  readonly kind: 'country'
  readonly op: 'is_any_of' | 'is_none_of'
  readonly values: ReadonlyArray<string> // ISO 3166-1 alpha-2
}

export interface LastActiveCondition {
  readonly kind: 'last_active'
  readonly op: 'within_days' | 'before_days' | 'never'
  readonly days?: number
}

export interface InstallDateCondition {
  readonly kind: 'install_date'
  // `*_days` operators are relative to today; `*_date` and `between`
  // pin to user-picked calendar dates (ISO yyyy-mm-dd).
  readonly op:
    | 'within_days'
    | 'before_days'
    | 'after_date'
    | 'before_date'
    | 'between'
  readonly days?: number
  readonly date?: string // ISO date — used by after_date / before_date
  readonly from?: string // ISO date — used by between
  readonly to?: string // ISO date — used by between
}

export interface PlatformCondition {
  readonly kind: 'platform'
  readonly op: 'is' | 'is_not'
  readonly values: ReadonlyArray<Platform>
}

export interface UserPropertyCondition {
  readonly kind: 'user_property'
  readonly key: string
  readonly op: ComparisonOp
  readonly value?: string | number | boolean | ReadonlyArray<string | number>
}

export interface EventPropertyFilter {
  readonly key: string
  readonly op: ComparisonOp
  readonly value?: string | number | boolean | ReadonlyArray<string | number>
}

export interface EventPerformedCondition {
  readonly kind: 'event_performed'
  readonly op: 'did' | 'did_not'
  readonly eventName: string
  readonly property?: EventPropertyFilter
  readonly windowDays?: number
  readonly minCount?: number
}

export interface AppVersionCondition {
  readonly kind: 'app_version'
  // String comparison for v1 — "2.10.0" sorts before "2.9.0" lexically.
  // Acceptable until we ship a semver-aware compare; the dashboard
  // input warns users.
  readonly op: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt'
  readonly version: string
}

export type AudienceCondition =
  | SegmentCondition
  | CountryCondition
  | LastActiveCondition
  | InstallDateCondition
  | PlatformCondition
  | UserPropertyCondition
  | EventPerformedCondition
  | AppVersionCondition

export type AudienceConditionKind = AudienceCondition['kind']

export interface AudienceSpec {
  readonly version: 1
  readonly mode: AudienceMode
  readonly combinator: AudienceCombinator
  readonly conditions: ReadonlyArray<AudienceCondition>
}

export function emptyAudienceSpec(): AudienceSpec {
  return { version: 1, mode: 'everyone', combinator: 'all', conditions: [] }
}

// -------------------- Trigger spec -----------------------

export type TriggerOccurrenceMode = 'every' | 'after_nth' | 'first_only'

export interface TriggerOccurrence {
  readonly mode: TriggerOccurrenceMode
  readonly n?: number // required when mode === 'after_nth'
}

export interface ActiveWindow {
  readonly startAt?: string // ISO datetime
  readonly endAt?: string // ISO datetime
}

export interface AppOpenTrigger {
  readonly kind: 'app_open'
  readonly delaySeconds?: number
  readonly onceOnly?: boolean
  readonly activeWindow?: ActiveWindow
}

export interface EventTrigger {
  readonly kind: 'event'
  readonly eventName: string
  readonly propertyFilters?: ReadonlyArray<EventPropertyFilter>
  readonly occurrence?: TriggerOccurrence
  readonly delaySeconds?: number
  readonly onceOnly?: boolean
  readonly activeWindow?: ActiveWindow
}

export interface AudienceJoinTrigger {
  readonly kind: 'audience_join'
  readonly delaySeconds?: number
  readonly onceOnly?: boolean
  readonly activeWindow?: ActiveWindow
}

export interface AppVersionChangedTrigger {
  readonly kind: 'app_version_changed'
  readonly delaySeconds?: number
  readonly onceOnly?: boolean
  readonly activeWindow?: ActiveWindow
}

export type TriggerSpec =
  | AppOpenTrigger
  | EventTrigger
  | AudienceJoinTrigger
  | AppVersionChangedTrigger

export type TriggerKind = TriggerSpec['kind']

/**
 * Synthetic event name the SDK emits whenever the host app cold-starts
 * or transitions from background to foreground. The trigger engine
 * indexes `app_open`-kind prompts under this name so the same matching
 * pipeline handles both event-driven and lifecycle-driven prompts.
 */
export const APP_OPEN_EVENT_NAME = '$app_open'

/**
 * Synthetic event the engine indexes `audience_join` campaigns under.
 * Mirrors APP_OPEN_EVENT_NAME so the same matching pipeline handles
 * both lifecycle and audience-membership triggers.
 */
export const AUDIENCE_JOIN_EVENT_NAME = '$audience_join'

/**
 * Synthetic event the SDK emits on cold-start when the persisted app
 * version differs from the running binary's version. Lets in-app
 * messages (and feedback / surveys) target users right after an update
 * — e.g. "What's new" modals.
 */
export const APP_VERSION_CHANGED_EVENT_NAME = '$app_version_changed'

export function defaultTriggerSpec(): TriggerSpec {
  return { kind: 'app_open' }
}

export function defaultEventTrigger(eventName = ''): EventTrigger {
  return {
    kind: 'event',
    eventName,
    occurrence: { mode: 'every' },
  }
}
