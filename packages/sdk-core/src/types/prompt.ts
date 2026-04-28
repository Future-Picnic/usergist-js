export type QuestionType = 'rating' | 'nps' | 'multiple_choice' | 'short_text'

export type RatingDisplayMode = 'stars' | 'numeric' | 'emoji'

export interface RatingQuestion {
  readonly id: string
  readonly type: 'rating'
  readonly title: string
  readonly subtitle?: string
  // Optional image rendered above the title. Uploaded via the
  // dashboard composer and served from the public R2 bucket.
  readonly imageUrl?: string
  readonly scale: 5 | 10
  readonly display?: RatingDisplayMode
  readonly lowLabel?: string
  readonly highLabel?: string
}

export interface NpsQuestion {
  readonly id: string
  readonly type: 'nps'
  readonly title: string
  readonly subtitle?: string
  readonly imageUrl?: string
  readonly followUp?: string
  readonly lowLabel?: string
  readonly highLabel?: string
}

export interface MultipleChoiceQuestion {
  readonly id: string
  readonly type: 'multiple_choice'
  readonly title: string
  readonly subtitle?: string
  readonly imageUrl?: string
  readonly options: ReadonlyArray<{ id: string; label: string }>
  readonly multiSelect?: boolean
}

export interface ShortTextQuestion {
  readonly id: string
  readonly type: 'short_text'
  readonly title: string
  readonly subtitle?: string
  readonly imageUrl?: string
  readonly placeholder?: string
  readonly maxLength?: number
}

export type Question =
  | RatingQuestion
  | NpsQuestion
  | MultipleChoiceQuestion
  | ShortTextQuestion

export interface PromptTheme {
  // Optional id of the THEME_PRESETS entry the user picked. Lets the
  // gallery highlight the right card on reload. Custom themes leave
  // this empty.
  readonly presetId?: string
  readonly colors?: {
    readonly primary?: string
    readonly background?: string
    readonly text?: string
    readonly subtext?: string
    readonly border?: string
    // Optional secondary tokens introduced with the preset gallery.
    readonly accent?: string
    readonly button?: string
  }
  readonly radius?: number
  readonly fontFamily?: string
}

export interface FrequencyCaps {
  readonly perPromptDays?: number
  readonly perUserDays?: number
}

export type PromptStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface Prompt {
  readonly id: string
  readonly appId: string
  readonly name: string
  /** @deprecated use `trigger.eventName` when `trigger.kind === 'event'` */
  readonly triggerEventName: string
  /** @deprecated use `audience` (segment-kind condition) */
  readonly segmentId?: string | null
  // Inline targeting spec — optional during the dual-write window so
  // older records (pre-migration) keep deserializing. When absent, the
  // engine derives an equivalent spec from the legacy fields.
  readonly audience?: import('./targeting.js').AudienceSpec
  readonly trigger?: import('./targeting.js').TriggerSpec
  readonly questions: ReadonlyArray<Question>
  readonly theme?: PromptTheme
  readonly frequency: FrequencyCaps
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly status: PromptStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ArmedTrigger {
  readonly promptId: string
  readonly eventName: string
  readonly segmentRules?: SerializedSegmentRules | null
  readonly frequency: FrequencyCaps
  readonly prompt: ClientPrompt
}

export interface ClientPrompt {
  readonly id: string
  readonly questions: ReadonlyArray<Question>
  readonly theme?: PromptTheme
}

// Lightweight segment representation the SDK can evaluate client-side for
// instant firing. The server is authoritative and re-verifies server-side.
export interface SerializedSegmentRules {
  readonly userProperties?: ReadonlyArray<UserPropertyRule>
  readonly eventCounts?: ReadonlyArray<EventCountRule>
}

export interface UserPropertyRule {
  readonly key: string
  readonly op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'gt' | 'lt'
  readonly value: string | number | boolean | ReadonlyArray<string | number>
}

export interface EventCountRule {
  readonly eventName: string
  readonly op: 'gte' | 'lte' | 'eq'
  readonly count: number
  readonly windowDays: number
}
