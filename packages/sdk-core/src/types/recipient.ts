import type { PromptResponse } from './response.js'
import type { SurveyAttemptSource, SurveyResponseRecord } from './survey.js'

export const RECIPIENTS_LIMIT = 100

export interface RecipientIdentity {
  readonly anonymousId: string
  readonly externalId: string | null
  readonly country: string | null
  readonly platform: string | null
}

export interface RecipientList<T> {
  readonly items: ReadonlyArray<T>
  readonly total: number
  readonly limit: number
}

export interface FeedbackRecipient extends RecipientIdentity {
  readonly receivedAt: string
  readonly response: PromptResponse | null
}

export type InAppRecipientStatus =
  | 'viewed'
  | 'dismissed'
  | 'auto_dismissed'
  | 'cta_clicked'

export interface InAppRecipient extends RecipientIdentity {
  readonly receivedAt: string
  readonly status: InAppRecipientStatus
  readonly actionAt: string | null
  readonly ctaLabel: string | null
}

export type SurveyRecipientStatus =
  | 'received'
  | 'declined'
  | 'in_progress'
  | 'completed'
  | 'abandoned'

export interface SurveyRecipient extends RecipientIdentity {
  readonly receivedAt: string
  readonly source: SurveyAttemptSource
  readonly status: SurveyRecipientStatus
  readonly attemptId: string | null
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly abandonedAt: string | null
  readonly responses: ReadonlyArray<SurveyResponseRecord>
}
