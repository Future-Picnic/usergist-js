export type EventPropertyValue = string | number | boolean | null

export interface EventProperties {
  readonly [key: string]: EventPropertyValue
}

export interface IngestEvent {
  /** Stable client-generated ID used to deduplicate network retries. */
  readonly eventId?: string
  readonly name: string
  readonly timestamp: string
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly properties?: EventProperties
  readonly sessionId?: string
  readonly sdkVersion?: string
  readonly appVersion?: string
  readonly platform?: SdkPlatform
}

export interface IngestBatch {
  readonly events: ReadonlyArray<IngestEvent>
  readonly context: IngestContext
}

export interface IngestContext {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly sdkVersion: string
  readonly platform: SdkPlatform
  readonly appVersion?: string
  readonly locale?: string
  readonly timezone?: string
  readonly osName?: string
  readonly osVersion?: string
  readonly deviceModel?: string
}

export type SdkPlatform =
  | 'ios'
  | 'android'
  | 'react-native'
  | 'flutter'
  | 'web'

export type EventPropertyType = 'string' | 'number' | 'boolean' | 'date'

export interface EventPropertySchema {
  readonly key: string
  readonly type: EventPropertyType
  readonly required?: boolean
}

export interface EventDefinition {
  readonly id: string
  readonly appId: string
  readonly name: string
  readonly description?: string
  readonly properties: ReadonlyArray<EventPropertySchema>
  readonly status: 'active' | 'deprecated'
  readonly createdAt: string
  readonly updatedAt: string
}
