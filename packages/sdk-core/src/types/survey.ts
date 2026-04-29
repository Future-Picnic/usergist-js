// ============================================================
// Survey types — shared between API, dashboard, and SDKs.
// A survey is a Campaign with type='survey'. The multi-step
// question graph + branching lives here.
// ============================================================

import type { PromptTheme, FrequencyCaps, SerializedSegmentRules } from './prompt.js'
import type { PushFrequencyCap, PushSchedule } from './campaign.js'
import type { AudienceSpec, TriggerSpec } from './targeting.js'

export type SurveyQuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'nps'
  | 'rating'
  | 'likert'
  | 'short_text'
  | 'long_text'
  | 'ranking'
  | 'single_date'
  | 'info_screen'

export type SurveyProgressStyle = 'bar' | 'dots' | 'none'

export interface SurveyChoiceOption {
  readonly id: string
  readonly label: string
}

export interface SurveyTextValidation {
  readonly kind?: 'email' | 'url' | 'number' | 'regex'
  readonly pattern?: string
  readonly minLength?: number
  readonly maxLength?: number
}

export interface BaseSurveyQuestion {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly required?: boolean
  // Optional image rendered above the question title. Uploaded
  // through the dashboard composer; URL points at the public R2
  // bucket.
  readonly imageUrl?: string
  readonly mergeTagContext?: Readonly<Record<string, unknown>>
}

export interface SingleChoiceQuestion extends BaseSurveyQuestion {
  readonly type: 'single_choice'
  readonly options: ReadonlyArray<SurveyChoiceOption>
  readonly allowOther?: boolean
}

export interface MultiChoiceQuestion extends BaseSurveyQuestion {
  readonly type: 'multi_choice'
  readonly options: ReadonlyArray<SurveyChoiceOption>
  readonly minSelections?: number
  readonly maxSelections?: number
  readonly allowOther?: boolean
}

export interface SurveyNpsQuestion extends BaseSurveyQuestion {
  readonly type: 'nps'
  readonly lowLabel?: string
  readonly highLabel?: string
}

export interface SurveyRatingQuestion extends BaseSurveyQuestion {
  readonly type: 'rating'
  readonly scale: 5 | 10
  readonly style?: 'star' | 'numeric'
  readonly lowLabel?: string
  readonly highLabel?: string
}

export interface LikertQuestion extends BaseSurveyQuestion {
  readonly type: 'likert'
  // 5-point: strongly disagree → strongly agree. Labels overridable.
  readonly labels?: readonly [string, string, string, string, string]
}

export interface SurveyShortTextQuestion extends BaseSurveyQuestion {
  readonly type: 'short_text'
  readonly placeholder?: string
  readonly validation?: SurveyTextValidation
}

export interface LongTextQuestion extends BaseSurveyQuestion {
  readonly type: 'long_text'
  readonly placeholder?: string
  readonly maxLength?: number
}

export interface RankingQuestion extends BaseSurveyQuestion {
  readonly type: 'ranking'
  readonly items: ReadonlyArray<SurveyChoiceOption>
}

export interface SingleDateQuestion extends BaseSurveyQuestion {
  readonly type: 'single_date'
  readonly minDate?: string
  readonly maxDate?: string
}

export interface InfoScreenQuestion extends BaseSurveyQuestion {
  readonly type: 'info_screen'
  readonly body?: string
}

export type SurveyQuestion =
  | SingleChoiceQuestion
  | MultiChoiceQuestion
  | SurveyNpsQuestion
  | SurveyRatingQuestion
  | LikertQuestion
  | SurveyShortTextQuestion
  | LongTextQuestion
  | RankingQuestion
  | SingleDateQuestion
  | InfoScreenQuestion

// ---------- Branching DSL ----------

export type SurveyBranchOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'includes'
  | 'not_includes'
  | 'answered'
  | 'unanswered'

export type SurveyBranchValue = string | number | boolean | ReadonlyArray<string | number>

export interface SurveyBranchCondition {
  readonly op: SurveyBranchOp
  readonly value?: SurveyBranchValue
}

export interface SurveyBranch {
  readonly fromQuestionId: string
  readonly condition: SurveyBranchCondition
  readonly toQuestionId: string // or '__end__' to jump straight to end screen
}

export const SURVEY_END_SENTINEL = '__end__'

// ---------- End screen ----------

export type SurveyEndCtaKind = 'url' | 'deep_link' | 'close'

export interface SurveyEndCta {
  readonly kind: SurveyEndCtaKind
  readonly label: string
  readonly target?: string
}

export interface SurveyFollowUp {
  readonly headline: string
  readonly body?: string
  readonly cta?: SurveyEndCta
}

export interface SurveyEndScreen {
  readonly headline: string
  readonly body?: string
  readonly cta?: SurveyEndCta
  readonly followUp?: SurveyFollowUp
}

// ---------- Localization ----------

export interface SurveyLocalization {
  readonly defaultLanguage?: string
  readonly languages?: Readonly<Record<string, {
    readonly questions?: ReadonlyArray<SurveyQuestion>
    readonly endScreen?: SurveyEndScreen
  }>>
}

// ---------- Flow ----------

export interface SurveyFlow {
  readonly startQuestionId: string
  readonly questions: ReadonlyArray<SurveyQuestion>
  readonly branches: ReadonlyArray<SurveyBranch>
  readonly progressStyle: SurveyProgressStyle
  readonly backNavigation: boolean
  readonly localization?: SurveyLocalization
  readonly endScreen?: SurveyEndScreen
}

// ---------- Campaign surface ----------

export type SurveyDeliveryMode =
  | 'triggered'
  | 'scheduled'
  | 'on_demand'
  | 'link_only'

export type SurveyAttemptSource =
  | 'triggered'
  | 'scheduled'
  | 'link'
  | 'on_demand'
  | 'test'

export interface SurveyCampaign {
  readonly id: string
  readonly appId: string
  readonly name: string
  readonly type: 'survey'
  readonly mode: SurveyDeliveryMode
  readonly status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'archived'
  readonly audienceSegmentId: string | null
  readonly triggerEventName: string | null
  // Inline AudienceSpec + TriggerSpec mirroring prompts.audience/trigger.
  // Null until the dashboard / API write them; legacy
  // audienceSegmentId / triggerEventName remain authoritative until
  // both sides have migrated.
  readonly audience: AudienceSpec | null
  readonly trigger: TriggerSpec | null
  readonly schedule: PushSchedule | null
  readonly frequencyCap: PushFrequencyCap
  readonly cooldownSeconds: number | null
  readonly openAccess: boolean
  readonly saveResumeWindowSeconds: number
  readonly endScreen: SurveyEndScreen | null
  readonly theme: PromptTheme | null
  readonly startAt: string | null
  readonly endAt: string | null
  readonly startedAt: string | null
  readonly endedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SurveyCampaignWithFlow extends SurveyCampaign {
  readonly flow: SurveyFlow
}

// ---------- Attempts / responses ----------

export interface SurveyAnswerRecord {
  readonly [questionId: string]: SurveyAnswerValue
}

export type SurveyAnswerValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<string>
  | ReadonlyArray<number>

export interface SurveyAttempt {
  readonly id: string
  readonly campaignId: string
  readonly anonymousId: string
  readonly externalId: string | null
  readonly startedAt: string
  readonly completedAt: string | null
  readonly abandonedAt: string | null
  readonly currentQuestionId: string | null
  readonly progressSnapshot: SurveyAnswerRecord
  readonly source: SurveyAttemptSource
  readonly language: string | null
}

export interface SurveyResponseRecord {
  readonly id: string
  readonly attemptId: string
  readonly campaignId: string
  readonly questionId: string
  readonly answerValue: SurveyAnswerValue
  readonly answeredAt: string
}

// ---------- SDK-facing payloads ----------

export interface SurveySummary {
  readonly id: string
  readonly name: string
  readonly mode: SurveyDeliveryMode
  readonly source: SurveyAttemptSource
  readonly offeredAt?: string
  readonly resumableAttemptId?: string | null
}

export interface SurveyOfferInstruction {
  readonly type: 'survey.offer'
  readonly surveyId: string
  readonly name: string
  readonly mode: SurveyDeliveryMode
  readonly source: SurveyAttemptSource
  readonly emittedAt: string
}

export interface CreateSurveyAttemptRequest {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly source: SurveyAttemptSource
  readonly language?: string
  readonly resume?: boolean
  readonly sdkVersion?: string
  readonly appVersion?: string
  readonly platform?: string
}

export interface CreateSurveyAttemptResponse {
  readonly attemptId: string
  readonly startQuestionId: string
  readonly progressSnapshot: SurveyAnswerRecord
  readonly currentQuestionId: string | null
  readonly resumed: boolean
}

export interface SubmitSurveyAnswersRequest {
  readonly answers: ReadonlyArray<{
    readonly questionId: string
    readonly value: SurveyAnswerValue
  }>
  readonly currentQuestionId?: string | null
}

export interface UpdateSurveyAttemptProgressRequest {
  readonly currentQuestionId: string | null
  readonly progressSnapshot: SurveyAnswerRecord
}

export interface CompleteSurveyAttemptRequest {
  readonly finalAnswers?: ReadonlyArray<{
    readonly questionId: string
    readonly value: SurveyAnswerValue
  }>
  readonly latencyMs?: number
}

export interface ResolveSurveyLinkRequest {
  readonly token: string
  readonly anonymousId: string
  readonly externalId?: string | null
}

export interface ResolveSurveyLinkResponse {
  readonly surveyId: string
  readonly name: string
  readonly consentRequired: boolean
  readonly openAccess: boolean
}

export interface SurveyShareLinkResponse {
  readonly url: string
  readonly token: string
  readonly expiresAt: string | null
}

// ---------- Templates ----------

export interface SurveyTemplate {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string | null
  readonly flow: SurveyFlow
  readonly recommendedTriggerEvent: string | null
  readonly recommendedMode: SurveyDeliveryMode | null
  readonly createdAt: string
}

// ---------- Create / update requests ----------

export interface CreateSurveyRequest {
  readonly name: string
  readonly mode: SurveyDeliveryMode
  readonly flow: SurveyFlow
  readonly audienceSegmentId?: string | null
  readonly triggerEventName?: string | null
  readonly schedule?: PushSchedule | null
  readonly frequencyCap?: PushFrequencyCap
  readonly frequency?: FrequencyCaps
  readonly cooldownSeconds?: number | null
  readonly openAccess?: boolean
  readonly saveResumeWindowSeconds?: number
  readonly endScreen?: SurveyEndScreen
  readonly theme?: PromptTheme
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly status?: SurveyCampaign['status']
}

export interface UpdateSurveyRequest extends Partial<CreateSurveyRequest> {
  readonly status?: SurveyCampaign['status']
}

export interface CloneSurveyFromTemplateRequest {
  readonly name?: string
  readonly audienceSegmentId?: string | null
  readonly triggerEventName?: string | null
}

// ---------- Analytics ----------

export interface SurveyFunnelStep {
  readonly questionId: string
  readonly shown: number
  readonly answered: number
  readonly skipped: number
}

export interface SurveyQuestionDistribution {
  readonly questionId: string
  readonly type: SurveyQuestionType
  readonly distribution: Readonly<Record<string, number>>
  readonly average?: number
  readonly npsScore?: number
  readonly sampleSize: number
}

export interface SurveyAnalytics {
  readonly surveyId: string
  readonly totals: {
    readonly started: number
    readonly completed: number
    readonly abandoned: number
    readonly completionRate: number
  }
  readonly funnel: ReadonlyArray<SurveyFunnelStep>
  readonly perQuestion: ReadonlyArray<SurveyQuestionDistribution>
  readonly npsOverTime?: ReadonlyArray<{ day: string; score: number; samples: number }>
  readonly perLanguage?: Readonly<Record<string, number>>
}

// ---------- SDK-side armed surveys ----------
//
// Mirrors `ArmedTrigger` (feedback). Returned by
// `GET /v1/sdk/armed-surveys` for every triggered + active survey
// the SDK should evaluate locally on each `track()`. The full
// `survey` payload is included so the SDK can render immediately
// on a match without a follow-up content fetch.

export interface ArmedSurvey {
  readonly campaignId: string
  readonly eventName: string
  readonly segmentRules?: SerializedSegmentRules | null
  readonly cooldownSeconds: number | null
  readonly frequencyCap: PushFrequencyCap
  readonly survey: SurveyCampaignWithFlow
}
