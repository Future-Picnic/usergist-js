import type { EventPropertyValue } from './event.js'

export const INTEGRATION_PROVIDERS = ['amplitude', 'mixpanel'] as const
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

export const INTEGRATION_CATEGORIES = [
  'feedback', 'surveys', 'inapp', 'push', 'requests', 'lifecycle',
] as const
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number]

export type IntegrationStatus = 'connected' | 'paused' | 'needs_attention' | 'disconnected'
export type AmplitudeIntegrationRegion = 'us' | 'eu'
export type MixpanelIntegrationRegion = 'us' | 'eu' | 'in'
export type IntegrationRegion = 'us' | 'eu' | 'in'
export type IntegrationDeliveryStatus =
  | 'pending' | 'leased' | 'retrying' | 'delivered' | 'dead_lettered' | 'skipped'
export type CoreEventSubjectRole = 'actor' | 'affected_user'

export interface CoreIntegrationEventDefinition {
  readonly key: string
  readonly name: string
  readonly category: IntegrationCategory | 'identity'
  readonly subjectRole: CoreEventSubjectRole
  readonly required?: boolean
  /** Stable output property key -> accepted source property aliases. */
  readonly properties: Readonly<Record<string, ReadonlyArray<string>>>
}

export const USER_IDENTIFIED_EVENT_NAME = '$user_identified' as const

function camelize(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

const ids = (...keys: string[]): Readonly<Record<string, ReadonlyArray<string>>> =>
  Object.fromEntries(keys.map((key) => [key, [key, camelize(key)]]))

const pushEvents: ReadonlyArray<readonly [string, string]> = [
  ['$push_sent', 'UserGist Push Sent'],
  ['$push_delivered', 'UserGist Push Delivered'],
  ['$push_received', 'UserGist Push Received'],
  ['$push_displayed', 'UserGist Push Displayed'],
  ['$push_opened', 'UserGist Push Opened'],
  ['$push_dismissed', 'UserGist Push Dismissed'],
  ['$push_clicked', 'UserGist Push Clicked'],
  ['$push_action_clicked', 'UserGist Push Action Clicked'],
  ['$push_bounced', 'UserGist Push Bounced'],
]

const requestEvents: ReadonlyArray<readonly [string, string, CoreEventSubjectRole]> = [
  ['$request_submitted', 'UserGist Request Submitted', 'actor'],
  ['$request_upvoted', 'UserGist Request Upvoted', 'actor'],
  ['$request_unupvoted', 'UserGist Request Unupvoted', 'actor'],
  ['$request_followed', 'UserGist Request Followed', 'actor'],
  ['$request_unfollowed', 'UserGist Request Unfollowed', 'actor'],
  ['$request_status_changed', 'UserGist Request Status Changed', 'affected_user'],
  ['$request_responded', 'UserGist Request Responded', 'affected_user'],
  ['$request_commented', 'UserGist Request Commented', 'actor'],
  ['$request_comment_edited', 'UserGist Request Comment Edited', 'actor'],
  ['$request_comment_deleted', 'UserGist Request Comment Deleted', 'affected_user'],
]

const answerProperties: Readonly<Record<string, ReadonlyArray<string>>> = {
  ...ids(
    'question_id',
    'question_type',
    'question_title',
    'answer_format',
    'answer_present',
    'answer_numeric_value',
    'answer_selection_count',
    'answer_text_length',
  ),
  // These aliases are generated only by the trusted server response paths.
  // The API delivery boundary removes them from public SDK events before this
  // normalizer runs. The complete answer_value stays in UserGist; destinations
  // receive a value only for server-verified structured data.
  answer_value: ['__usergist_destination_answer_value'],
  answer_display_value: ['__usergist_destination_answer_display_value'],
}

export const CORE_INTEGRATION_EVENTS: ReadonlyArray<CoreIntegrationEventDefinition> = [
  { key: '$app_open', name: 'UserGist App Opened', category: 'lifecycle', subjectRole: 'actor', properties: {} },
  { key: '$app_version_changed', name: 'UserGist App Version Changed', category: 'lifecycle', subjectRole: 'actor', properties: { ...ids('old_version', 'new_version') } },
  { key: USER_IDENTIFIED_EVENT_NAME, name: 'UserGist User Identified', category: 'identity', subjectRole: 'actor', required: true, properties: {} },
  { key: '$feedback_prompt_shown', name: 'UserGist Feedback Prompt Shown', category: 'feedback', subjectRole: 'actor', properties: { ...ids('prompt_id') } },
  { key: '$feedback_response', name: 'UserGist Feedback Response Submitted', category: 'feedback', subjectRole: 'actor', properties: { ...ids('response_id', 'prompt_id', 'prompt_name', 'dismissed', 'latency_ms', 'answer_count', 'feedback_types') } },
  { key: '$feedback_answer_submitted', name: 'UserGist Feedback Answer Submitted', category: 'feedback', subjectRole: 'actor', properties: { ...ids('response_id', 'prompt_id', 'prompt_name'), ...answerProperties } },
  { key: '$survey_started', name: 'UserGist Survey Started', category: 'surveys', subjectRole: 'actor', properties: { ...ids('campaign_id', 'survey_name', 'attempt_id', 'language', 'source') } },
  { key: '$survey_answer_submitted', name: 'UserGist Survey Answer Submitted', category: 'surveys', subjectRole: 'actor', properties: { ...ids('response_id', 'campaign_id', 'survey_name', 'attempt_id', 'language'), ...answerProperties } },
  { key: '$survey_completed', name: 'UserGist Survey Completed', category: 'surveys', subjectRole: 'actor', properties: { ...ids('campaign_id', 'survey_name', 'attempt_id', 'language', 'source', 'duration_ms') } },
  { key: '$survey_abandoned', name: 'UserGist Survey Abandoned', category: 'surveys', subjectRole: 'actor', properties: { ...ids('campaign_id', 'survey_name', 'attempt_id', 'language', 'source', 'duration_ms') } },
  { key: '$inapp_shown', name: 'UserGist In-App Message Shown', category: 'inapp', subjectRole: 'actor', properties: { ...ids('message_id') } },
  { key: '$inapp_dismissed', name: 'UserGist In-App Message Dismissed', category: 'inapp', subjectRole: 'actor', properties: { ...ids('message_id', 'dismiss_reason') } },
  { key: '$inapp_auto_dismissed', name: 'UserGist In-App Message Auto-Dismissed', category: 'inapp', subjectRole: 'actor', properties: { ...ids('message_id', 'dismiss_reason') } },
  { key: '$inapp_cta_clicked', name: 'UserGist In-App Message CTA Clicked', category: 'inapp', subjectRole: 'actor', properties: { ...ids('message_id', 'cta_id', 'cta_index'), action: ['action', 'cta_action'] } },
  ...pushEvents.map(([key, name]) => ({
    key,
    name,
    category: 'push' as const,
    subjectRole: 'actor' as const,
    properties: {
      ...ids('delivery_id', 'campaign_id', 'delivery_state', 'failure_code'),
      action_id: ['action_id', 'actionId', 'action_button', 'actionButton'],
    },
  })),
  ...requestEvents.map(([key, name, subjectRole]) => ({ key, name, category: 'requests' as const, subjectRole, properties: { ...ids('request_id', 'comment_id', 'source', 'old_status', 'new_status', 'deleted_by'), usergist_actor_type: ['usergist_actor_type', 'actor_type'] } })),
]

const CORE_EVENT_BY_KEY = new Map(CORE_INTEGRATION_EVENTS.map((event) => [event.key, event]))

export function getCoreIntegrationEvent(key: string): CoreIntegrationEventDefinition | null {
  return CORE_EVENT_BY_KEY.get(key) ?? null
}

export function sanitizeCoreIntegrationProperties(
  definition: CoreIntegrationEventDefinition,
  input: Readonly<Record<string, unknown>> | null | undefined,
): Readonly<Record<string, EventPropertyValue>> {
  if (!input) return {}
  const output: Record<string, EventPropertyValue> = {}
  for (const [outputKey, aliases] of Object.entries(definition.properties)) {
    const alias = aliases.find((candidate) => Object.prototype.hasOwnProperty.call(input, candidate))
    if (!alias) continue
    const value = input[alias]
    if (typeof value === 'string') output[outputKey] = value.slice(0, 1024)
    else if (typeof value === 'number' && Number.isFinite(value)) output[outputKey] = value
    else if (typeof value === 'boolean' || value === null) output[outputKey] = value
  }
  return output
}

export interface IntegrationSummary {
  readonly id: string
  readonly provider: IntegrationProvider
  readonly status: IntegrationStatus
  readonly region: IntegrationRegion
  readonly categories: ReadonlyArray<IntegrationCategory>
  readonly credentialHint: string | null
  readonly connectedAt: string | null
  readonly pausedAt: string | null
  readonly lastVerifiedAt: string | null
  readonly lastSuccessAt: string | null
  readonly lastFailureAt: string | null
  readonly lastErrorCode: string | null
  readonly lastErrorMessage: string | null
}

export type ConnectIntegrationRequest =
  | { readonly provider: 'amplitude'; readonly apiKey: string; readonly region: 'us' | 'eu'; readonly categories: ReadonlyArray<IntegrationCategory> }
  | { readonly provider: 'mixpanel'; readonly projectToken: string; readonly region: 'us' | 'eu' | 'in'; readonly categories: ReadonlyArray<IntegrationCategory>; readonly identityMode: 'simplified' }

export interface UpdateIntegrationRequest {
  readonly categories: ReadonlyArray<IntegrationCategory>
}

export interface IntegrationTestResult {
  readonly accepted: true
  readonly eventName: 'UserGist Integration Connected'
  readonly deviceId: string
  readonly acceptedAt: string
}

export interface IntegrationDeliverySummary {
  readonly id: string
  readonly eventKey: string
  readonly eventName: string
  readonly status: IntegrationDeliveryStatus
  readonly identity: { readonly anonymousId: string; readonly externalId: string | null }
  readonly occurredAt: string
  readonly attempts: number
  readonly providerStatusCode: number | null
  readonly lastErrorMessage: string | null
}

export interface IntegrationDeliveriesResponse {
  readonly items: ReadonlyArray<IntegrationDeliverySummary>
  readonly nextCursor: string | null
}
