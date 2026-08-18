import type {
  ArmedTrigger,
  ClientPrompt,
  PromptTheme,
} from '@usergist/sdk-core/mobile'

export interface ResolvedConfig {
  readonly writeKey: string
  readonly apiUrl: string
  readonly environment: 'production' | 'staging' | 'development'
  readonly flushIntervalMs: number
  readonly flushBatchSize: number
  readonly maxQueueSize: number
  readonly triggerSyncIntervalMs: number
  readonly debug: boolean
}

export interface IdentityState {
  readonly anonymousId: string
  readonly externalId: string | null
}

export interface ConsentState {
  readonly analytics: boolean
  readonly feedback: boolean
  readonly push: boolean
  readonly survey: boolean
  readonly updatedAt: string | null
  readonly version: number
}

export interface QueuedEvent {
  readonly eventId: string
  readonly purpose: 'analytics' | 'feedback'
  readonly name: string
  readonly timestamp: string
  readonly anonymousId: string
  readonly externalId: string | null
  readonly properties?: Readonly<Record<string, string | number | boolean | null>>
  readonly sessionId?: string
}

export interface StoredRulesCache {
  readonly triggers: ReadonlyArray<ArmedTrigger>
  readonly fetchedAt: string
  readonly serverTime: string
  readonly nextSyncMs: number
}

export interface StoredSurveyRulesCache {
  readonly surveys: ReadonlyArray<import('@usergist/sdk-core/mobile').ArmedSurvey>
  readonly fetchedAt: string
  readonly serverTime: string
  readonly nextSyncMs: number
}

export interface FrequencyCapEntry {
  readonly promptId: string
  readonly lastShownAt: string
}

export interface FrequencyCapState {
  readonly perPrompt: Readonly<Record<string, string>>
  readonly lastAnyPromptAt: string | null
}

export type DecisionOutcome =
  | 'fired'
  | 'blocked-by-consent'
  | 'blocked-by-segment'
  | 'blocked-by-cap'
  | 'blocked-no-trigger'
  | 'blocked-error'

export interface DecisionTrace {
  readonly eventName: string
  readonly promptId?: string
  readonly outcome: DecisionOutcome
  readonly reason?: string
  readonly at: string
}

export interface ShowPromptPayload {
  readonly promptId: string
  readonly prompt: ClientPrompt
  readonly theme?: PromptTheme
  readonly shownAt: number
  readonly triggerEventName: string
}

export interface ResponseEmission {
  readonly promptId: string
  readonly answers: ReadonlyArray<{ questionId: string; value: number | string | ReadonlyArray<string> | null }>
  readonly dismissed: boolean
  readonly latencyMs: number
}

export interface EventCountEntry {
  readonly count: number
  readonly lastAt: string
}

export interface UserEventHistory {
  // eventName -> events timestamps array (cap to recent)
  readonly timestamps: Readonly<Record<string, ReadonlyArray<string>>>
}

export interface UserPropertiesState {
  readonly properties: Readonly<Record<string, string | number | boolean | null>>
}
