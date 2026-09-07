import type {
  Consent,
  SdkConfig,
  SurveySummary,
  WebPresentation,
  EventPropertyValue,
} from '@usergist/sdk-core/client'
export type RuntimeState =
  | 'inactive'
  | 'activating'
  | 'active-anonymous'
  | 'active-identified'
  | 'authentication-required'
  | 'destroyed'
export type IdentifyResult = 'synced' | 'rejected'
export type OpenResult = {
  status: 'opened' | 'unavailable' | 'inactive' | 'consent_required' | 'failed'
  message?: string
}
export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly at: string
}
export interface LauncherConfig {
  enabled: boolean
  label?: string
  feedbackPromptId?: string
  surveys?: boolean
  requests?: boolean
  position?: 'left' | 'right'
}
export interface WebSdkConfig extends SdkConfig {
  allowAnonymous?: boolean
  getSubjectToken?: (userId: string) => Promise<string>
  launcher?: LauncherConfig
  nonce?: string
  container?: HTMLElement
  zIndex?: number
  onNavigate?: (url: string) => void
  onDeepLink?: (url: string) => void
  onAction?: (action: Readonly<Record<string, unknown>>) => void
  onDiagnostic?: (diagnostic: Diagnostic) => void
}
export interface RuntimeSnapshot {
  state: RuntimeState
  externalId: string | null
  anonymousId: string | null
  consent: Consent
  queueSize: number
  clientId: string | null
  screenName: string
}
export type Properties = Record<string, EventPropertyValue>
export interface PersistedWork {
  id: string
  path: string
  method: string
  body: unknown
  purpose: 'analytics' | 'feedback' | 'survey'
  createdAt: number
}
export type { Consent, SurveySummary, WebPresentation }

export type RequestMutationResult<T> = T | { queued: true; pendingId: string }
