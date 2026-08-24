import type { AudienceSpec, TriggerSpec } from './targeting.js'

export const INAPP_SHOWN_EVENT_NAME = '$inapp_shown'
export const INAPP_DISMISSED_EVENT_NAME = '$inapp_dismissed'
export const INAPP_AUTO_DISMISSED_EVENT_NAME = '$inapp_auto_dismissed'
export const INAPP_CTA_CLICKED_EVENT_NAME = '$inapp_cta_clicked'

export type InAppMessageFormat = 'modal' | 'modal_full' | 'slideup'

export type InAppMessageStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived'

export type InAppMessageMode = 'triggered' | 'scheduled'

export type InAppCtaAction = 'open_url' | 'deep_link' | 'dismiss' | 'custom_event'

export interface InAppCta {
  readonly label: string
  readonly action: InAppCtaAction
  readonly target?: string
}

// Three-state cooldowns + cross-pillar caps. Each key is optional —
// omitting means "no cap on this dimension".
export interface InAppFrequency {
  readonly cooldownAfterShownDays?: number
  readonly cooldownAfterDismissedDays?: number
  readonly cooldownAfterCtaClickedDays?: number
  readonly maxImpressionsPerUser?: number
  readonly perPillarDays?: number
  readonly perGlobalDays?: number
}

export interface InAppMessage {
  readonly id: string
  readonly appId: string
  readonly name: string
  readonly status: InAppMessageStatus
  readonly mode: InAppMessageMode

  readonly audienceSegmentId: string | null
  readonly audience: AudienceSpec | null
  readonly trigger: TriggerSpec | null
  readonly triggerEventName: string | null
  readonly schedule: unknown | null

  readonly screenAllowlist: ReadonlyArray<string>
  readonly screenDenylist: ReadonlyArray<string>

  readonly frequency: InAppFrequency

  readonly conversionGoalEvent: string | null
  readonly conversionWindowHours: number

  readonly priority: number
  readonly forceShow: boolean
  readonly autoDismissSeconds: number | null

  readonly format: InAppMessageFormat
  readonly title: string
  readonly body: string | null
  readonly imageUrl: string | null
  readonly backgroundColor: string | null
  readonly accentColor: string | null
  readonly backdropEnabled: boolean
  readonly ctas: ReadonlyArray<InAppCta>

  readonly startAt: string | null
  readonly endAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateInAppMessageRequest {
  readonly name: string
  readonly audienceSegmentId?: string | null
  readonly audience?: AudienceSpec
  readonly trigger?: TriggerSpec
  readonly triggerEventName?: string | null
  readonly screenAllowlist?: ReadonlyArray<string>
  readonly screenDenylist?: ReadonlyArray<string>
  readonly frequency?: InAppFrequency
  readonly conversionGoalEvent?: string | null
  readonly conversionWindowHours?: number
  readonly priority?: number
  readonly forceShow?: boolean
  readonly autoDismissSeconds?: number | null
  readonly format: InAppMessageFormat
  readonly title: string
  readonly body?: string | null
  readonly imageUrl?: string | null
  readonly backgroundColor?: string | null
  readonly accentColor?: string | null
  readonly backdropEnabled?: boolean
  readonly ctas?: ReadonlyArray<InAppCta>
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly status?: InAppMessageStatus
}

export interface UpdateInAppMessageRequest extends Partial<CreateInAppMessageRequest> {
  readonly status?: InAppMessageStatus
}

export interface InAppMessageAnalytics {
  readonly totals: {
    readonly impressions: number
    readonly dismissed: number
    readonly autoDismissed: number
    readonly ctaClicked: number
  }
  readonly timeline: ReadonlyArray<{
    readonly day: string
    readonly impressions: number
    readonly dismissed: number
    readonly ctaClicked: number
  }>
}

// Subset of the message the SDK needs at render time. Mirrors
// `ArmedTrigger.prompt` for feedback prompts — strips fields the device
// doesn't need (audit columns, segment id) and leaves what the renderer
// uses.
export interface ArmedInAppMessage {
  readonly messageId: string
  readonly eventName: string
  /** True only when the SDK can make the same targeting decision locally. */
  readonly clientSideEligible?: boolean
  readonly format: InAppMessageFormat
  readonly title: string
  readonly body: string | null
  readonly imageUrl: string | null
  readonly backgroundColor: string | null
  readonly accentColor: string | null
  /** Defaults to true when omitted by an older API/cache payload. */
  readonly backdropEnabled?: boolean
  readonly ctas: ReadonlyArray<InAppCta>
  readonly autoDismissSeconds: number | null
  readonly screenAllowlist: ReadonlyArray<string>
  readonly screenDenylist: ReadonlyArray<string>
  readonly forceShow: boolean
}
