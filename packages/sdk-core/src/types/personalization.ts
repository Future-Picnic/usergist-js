import type { EventPropertyFilter } from './targeting.js'

export type PersonalizationScalar = string | number | boolean | null
export type PersonalizationFieldType = 'string' | 'number' | 'boolean' | 'date'

export type PersonalizationSource = {
  readonly id: string
  readonly label: string
} & (
  | {
      readonly kind:
        | 'user_property'
        | 'trigger_event'
        | 'send_data'
        | 'app'
        | 'now'
    }
  | {
      readonly kind: 'latest_event'
      readonly eventName: string
      readonly lookbackDays: number
      readonly filters?: ReadonlyArray<EventPropertyFilter>
    }
)

export interface PersonalizationBinding {
  readonly id: string
  readonly label: string
  readonly sourceId: string
  /** Literal property key; dots are not interpreted as object traversal. */
  readonly key: string
  readonly type: PersonalizationFieldType
  readonly fallback?: PersonalizationScalar
}

export interface PersonalizationSpec {
  readonly version: 1
  readonly sources: ReadonlyArray<PersonalizationSource>
  readonly bindings: ReadonlyArray<PersonalizationBinding>
  readonly missingData: 'skip'
}

export interface PersonalizationSourceValue {
  readonly values: Readonly<Record<string, PersonalizationScalar>>
  readonly eventId?: string
  readonly occurredAt?: string
}

export interface PersonalizationIssue {
  readonly code:
    | 'missing'
    | 'type_mismatch'
    | 'unknown_binding'
    | 'invalid_template'
    | 'invalid_destination'
  readonly bindingId?: string
  readonly path?: string
  readonly message: string
}

export interface PersonalizationResolution {
  readonly status: 'ready' | 'using_fallback' | 'skipped'
  readonly values: Readonly<Record<string, PersonalizationScalar>>
  readonly fallbackBindingIds: ReadonlyArray<string>
  readonly issues: ReadonlyArray<PersonalizationIssue>
  readonly sources: Readonly<Record<string, PersonalizationSourceValue>>
}

export type PersonalizationSurface = 'push' | 'inapp' | 'feedback' | 'survey'

export interface UserPropertiesUpdate {
  readonly set?: Readonly<Record<string, PersonalizationScalar>>
  readonly unset?: ReadonlyArray<string>
  readonly mutationId: string
}
