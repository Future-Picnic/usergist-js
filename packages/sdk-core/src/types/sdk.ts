export type ConsentPurpose = 'analytics' | 'feedback' | 'push'

export type Consent = {
  readonly [K in ConsentPurpose]?: boolean
}

export interface SdkConfig {
  readonly writeKey: string
  readonly apiUrl?: string
  readonly environment?: 'production' | 'staging' | 'development'
  readonly flushIntervalMs?: number
  readonly flushBatchSize?: number
  readonly maxQueueSize?: number
  readonly triggerSyncIntervalMs?: number
  readonly debug?: boolean
}
