export type PushDeliveryMode = 'broadcast' | 'scheduled' | 'triggered' | 'transactional'

export type CampaignType = 'push' | 'survey'

export type CampaignMode =
  | 'broadcast'
  | 'scheduled'
  | 'triggered'
  | 'transactional'
  | 'on_demand'
  | 'link_only'

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived'

export type PushActionType = 'open_app' | 'deep_link' | 'url' | 'dismiss'

export interface PushActionButton {
  readonly label: string
  readonly action: PushActionType
  readonly target?: string
}

export interface PushVariant {
  readonly id: string
  readonly campaignId: string
  readonly language: string | null
  readonly title: string
  readonly body: string
  readonly imageUrl: string | null
  readonly actionButtons: ReadonlyArray<PushActionButton>
  readonly deepLink: string | null
  readonly badge: string | null
  readonly sound: string | null
  readonly payloadExtras: Readonly<Record<string, unknown>>
  readonly abGroup: string | null
  readonly weight: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PushSchedule {
  readonly kind: 'once_utc' | 'once_local' | 'cron'
  readonly at?: string
  readonly date?: string
  readonly hourLocal?: number
  readonly minuteLocal?: number
  readonly cron?: string
}

export interface PushFrequencyCap {
  readonly perCampaignDays?: number
  readonly perPillarDays?: number
  readonly perGlobalDays?: number
  readonly maxPerUser?: number
}

export interface PushQuietHours {
  readonly enabled: boolean
  readonly startLocal: number
  readonly endLocal: number
  readonly behavior: 'hold' | 'drop'
}

export interface PushABConfig {
  readonly enabled: boolean
  readonly winnerMetric: 'delivered' | 'opened' | 'clicked'
  readonly autoPromote: boolean
  readonly confidence: number
}

export interface Campaign {
  readonly id: string
  readonly appId: string
  readonly name: string
  readonly type: 'push'
  readonly mode: PushDeliveryMode
  readonly status: CampaignStatus
  readonly audienceSegmentId: string | null
  readonly triggerEventName: string | null
  readonly schedule: PushSchedule | null
  readonly frequencyCap: PushFrequencyCap
  readonly quietHours: PushQuietHours
  readonly abConfig: PushABConfig
  readonly startAt: string | null
  readonly endAt: string | null
  readonly startedAt: string | null
  readonly endedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CampaignWithVariants extends Campaign {
  readonly variants: ReadonlyArray<PushVariant>
}

export interface RegisterDeviceTokenPayload {
  readonly anonymousId: string
  readonly externalId?: string
  readonly token: string
  readonly platform: 'ios' | 'android'
  readonly environment?: 'production' | 'sandbox'
  readonly language?: string
  readonly timezone?: string
  readonly appVersion?: string
  readonly sdkVersion?: string
  readonly optIn?: boolean
}

export interface UpdateDeviceTokenPayload {
  readonly anonymousId: string
  readonly token: string
  readonly language?: string
  readonly timezone?: string
  readonly optIn?: boolean
  readonly appVersion?: string
  readonly sdkVersion?: string
}

export interface InvalidateDeviceTokenPayload {
  readonly anonymousId: string
  readonly token: string
}

export interface CreateCampaignRequest {
  readonly name: string
  readonly mode: PushDeliveryMode
  readonly audienceSegmentId?: string | null
  readonly triggerEventName?: string | null
  readonly schedule?: PushSchedule | null
  readonly frequencyCap?: PushFrequencyCap
  readonly quietHours?: PushQuietHours
  readonly abConfig?: PushABConfig
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly variants: ReadonlyArray<Omit<PushVariant, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'>>
}

export interface UpdateCampaignRequest extends Partial<CreateCampaignRequest> {
  readonly status?: CampaignStatus
}

export interface PushTransactionalRequest {
  readonly campaignId: string
  readonly anonymousId?: string
  readonly externalId?: string
  readonly mergeTags?: Readonly<Record<string, unknown>>
  readonly override?: {
    readonly title?: string
    readonly body?: string
    readonly imageUrl?: string
  }
  readonly idempotencyKey?: string
}

export interface PushCredentialSummary {
  readonly id: string
  readonly platform: 'ios' | 'android'
  readonly environment: 'production' | 'sandbox'
  readonly keyId: string | null
  readonly teamId: string | null
  readonly bundleId: string | null
  readonly projectId: string | null
  readonly clientEmail: string | null
  readonly uploadedAt: string
  readonly expiresAt: string | null
}

export interface UploadApnsCredentialRequest {
  readonly platform: 'ios'
  readonly environment?: 'production' | 'sandbox'
  readonly p8: string
  readonly keyId: string
  readonly teamId: string
  readonly bundleId: string
}

export interface UploadFcmCredentialRequest {
  readonly platform: 'android'
  readonly serviceAccountJson: string
}

export type UploadCredentialRequest =
  | UploadApnsCredentialRequest
  | UploadFcmCredentialRequest

export interface CampaignAnalytics {
  readonly totals: {
    readonly sent: number
    readonly delivered: number
    readonly opened: number
    readonly clicked: number
    readonly errors: number
  }
  readonly perVariant: ReadonlyArray<{
    readonly variant_id: string
    readonly language: string | null
    readonly sent: number
    readonly opened: number
    readonly clicked: number
  }>
  readonly timeline: ReadonlyArray<{
    readonly day: string
    readonly sent: number
    readonly opened: number
    readonly clicked: number
  }>
}
