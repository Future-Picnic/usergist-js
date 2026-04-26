// ============================================================
// API contract — every endpoint path, method, request, response.
// The API implements this; clients (dashboard, SDKs) consume it.
// If you add/modify a route, update this file first.
// ============================================================

import type {
  EventDefinition,
  IngestBatch,
  EventPropertySchema,
} from '../types/event.js'
import type {
  ArmedTrigger,
  Prompt,
  Question,
  PromptTheme,
  FrequencyCaps,
  PromptStatus,
} from '../types/prompt.js'
import type { Segment } from '../types/segment.js'
import type { SegmentDsl } from '../types/segment-dsl.js'
import type { PromptResponse, SubmitResponsePayload } from '../types/response.js'
import type {
  App,
  CreatedWriteKey,
  RotateWriteKeyRequest,
  RotateWriteKeyResponse,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  WriteKey,
} from '../types/workspace.js'
import type { Consent } from '../types/sdk.js'
import type {
  Campaign,
  CampaignAnalytics,
  CampaignWithVariants,
  CreateCampaignRequest,
  InvalidateDeviceTokenPayload,
  PushCredentialSummary,
  PushTransactionalRequest,
  RegisterDeviceTokenPayload,
  UpdateCampaignRequest,
  UpdateDeviceTokenPayload,
  UploadCredentialRequest,
} from '../types/campaign.js'
import type {
  CloneSurveyFromTemplateRequest,
  CompleteSurveyAttemptRequest,
  CreateSurveyAttemptRequest,
  CreateSurveyAttemptResponse,
  CreateSurveyRequest,
  ResolveSurveyLinkRequest,
  ResolveSurveyLinkResponse,
  SubmitSurveyAnswersRequest,
  SurveyAnalytics,
  SurveyCampaign,
  SurveyCampaignWithFlow,
  SurveyResponseRecord,
  SurveyShareLinkResponse,
  SurveySummary,
  SurveyTemplate,
  UpdateSurveyAttemptProgressRequest,
  UpdateSurveyRequest,
} from '../types/survey.js'

// ---------- auth ----------

export interface LoginPasswordRequest {
  readonly email: string
  readonly password: string
}

export interface LoginMagicLinkRequest {
  readonly email: string
}

export interface LoginMagicLinkConsumeRequest {
  readonly token: string
}

export interface SignupRequest {
  readonly email: string
  readonly password: string
  readonly name?: string
  readonly workspaceName: string
}

export interface AuthSession {
  readonly user: User
  readonly token: string
  readonly expiresAt: string
}

// ---------- workspaces ----------

export interface CreateWorkspaceRequest {
  readonly name: string
  readonly slug?: string
}

export interface InviteMemberRequest {
  readonly email: string
  readonly role: Exclude<WorkspaceRole, 'owner'>
}

// ---------- apps ----------

export interface CreateAppRequest {
  readonly name: string
  readonly slug?: string
  readonly platforms: App['platforms']
}

export interface UpdateAppRequest {
  readonly name?: string
  readonly platforms?: App['platforms']
  readonly piiAllowList?: ReadonlyArray<string>
  readonly lifecycleEventsEnabled?: boolean
}

export interface CreateWriteKeyRequest {
  readonly label?: string
  readonly environment?: WriteKey['environment']
}

// ---------- event definitions ----------

export interface RegisterEventDefinitionRequest {
  readonly name: string
  readonly description?: string
  readonly properties?: ReadonlyArray<EventPropertySchema>
}

export interface UpdateEventDefinitionRequest {
  readonly description?: string
  readonly properties?: ReadonlyArray<EventPropertySchema>
  readonly status?: EventDefinition['status']
}

// ---------- segments ----------

export interface CreateSegmentRequest {
  readonly name: string
  readonly description?: string
  readonly rules: SegmentDsl
  readonly refreshMode?: 'hot' | 'cold' | 'manual'
}

export interface AppUserSummary {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly eventCount?: number
  readonly topProperties?: Readonly<Record<string, string | number | boolean | null>>
}

export interface AppUserDetail {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly properties: Readonly<Record<string, string | number | boolean | null>>
  readonly eventCount: number
}

export interface AppUserEvent {
  readonly id: string
  readonly name: string
  readonly occurredAt: string
  readonly properties: Readonly<Record<string, unknown>>
  readonly platform?: string | null
  readonly appVersion?: string | null
}

export interface ListUsersQuery {
  readonly q?: string
  readonly page?: number
  readonly limit?: number
}

export interface ListUserEventsQuery {
  readonly from?: string
  readonly to?: string
  readonly page?: number
  readonly limit?: number
}

export interface GenerateSegmentRulesRequest {
  readonly name?: string
  readonly description?: string
}

export interface GenerateSegmentRulesResponse {
  readonly rules: SegmentDsl
  readonly rationale: string
}

export interface GenerateSegmentNameRequest {
  readonly rules: SegmentDsl
}

export interface GenerateSegmentNameResponse {
  readonly name: string
  readonly description: string
}

export interface SegmentPreview {
  readonly estimatedCount: number
  readonly sampleUsers: ReadonlyArray<{
    readonly anonymousId: string
    readonly externalId?: string | null
    readonly properties: Record<string, unknown>
  }>
}

// ---------- prompts ----------

export interface CreatePromptRequest {
  readonly name: string
  readonly triggerEventName: string
  readonly segmentId?: string | null
  readonly questions: ReadonlyArray<Question>
  readonly theme?: PromptTheme
  readonly frequency?: FrequencyCaps
  readonly startAt?: string | null
  readonly endAt?: string | null
}

export interface UpdatePromptRequest {
  readonly name?: string
  readonly triggerEventName?: string
  readonly segmentId?: string | null
  readonly questions?: ReadonlyArray<Question>
  readonly theme?: PromptTheme
  readonly frequency?: FrequencyCaps
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly status?: PromptStatus
}

export interface TestPromptOnDeviceRequest {
  readonly anonymousId: string
}

// ---------- responses ----------

export interface ListResponsesQuery {
  readonly promptId?: string
  readonly from?: string
  readonly to?: string
  readonly page?: number
  readonly limit?: number
  readonly segmentId?: string
}

export interface PromptAnalytics {
  readonly promptId: string
  readonly shown: number
  readonly responded: number
  readonly dismissed: number
  readonly completionRate: number
  readonly perQuestion: ReadonlyArray<{
    readonly questionId: string
    readonly type: Question['type']
    readonly distribution: Readonly<Record<string, number>>
    readonly average?: number
    readonly npsScore?: number
  }>
}

// ---------- SDK-facing ----------

export interface SdkIngestRequest extends IngestBatch {}

export interface SdkIngestResponse {
  readonly accepted: number
  readonly rejected: number
  readonly errors?: ReadonlyArray<{ index: number; reason: string }>
}

export interface SdkArmedTriggersResponse {
  readonly triggers: ReadonlyArray<ArmedTrigger>
  readonly serverTime: string
  readonly nextSyncMs: number
}

export interface SdkConsentPayload {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly purposes: Consent
}

export interface SdkIdentifyPayload {
  readonly anonymousId: string
  readonly externalId: string
  readonly properties?: Record<string, string | number | boolean | null>
}

// ---------- GDPR ----------

export interface GdprDeleteRequest {
  readonly externalId?: string
  readonly anonymousId?: string
}

export interface GdprExportRequest {
  readonly externalId?: string
  readonly anonymousId?: string
}

// ---------- endpoint map ----------
// Keys are method+path. Values are { request, response } for typing.
// This is kept as a literal object so it can be walked at build time
// to generate a typed client and OpenAPI spec.

export type Endpoint<Req, Res> = { readonly __req?: Req; readonly __res: Res }

export const endpoints = {
  'POST /v1/auth/signup': {} as Endpoint<SignupRequest, AuthSession>,
  'POST /v1/auth/login': {} as Endpoint<LoginPasswordRequest, AuthSession>,
  'POST /v1/auth/magic-link': {} as Endpoint<LoginMagicLinkRequest, { sent: true }>,
  'POST /v1/auth/magic-link/consume': {} as Endpoint<LoginMagicLinkConsumeRequest, AuthSession>,
  'POST /v1/auth/logout': {} as Endpoint<void, { ok: true }>,
  'GET /v1/me': {} as Endpoint<void, { user: User; workspaces: ReadonlyArray<Workspace> }>,

  'GET /v1/workspaces': {} as Endpoint<void, ReadonlyArray<Workspace>>,
  'POST /v1/workspaces': {} as Endpoint<CreateWorkspaceRequest, Workspace>,
  'GET /v1/workspaces/:wid/members': {} as Endpoint<void, ReadonlyArray<WorkspaceMember>>,
  'POST /v1/workspaces/:wid/invites': {} as Endpoint<InviteMemberRequest, { sent: true }>,

  'GET /v1/workspaces/:wid/apps': {} as Endpoint<void, ReadonlyArray<App>>,
  'POST /v1/workspaces/:wid/apps': {} as Endpoint<CreateAppRequest, App>,
  'GET /v1/apps/:appId': {} as Endpoint<void, App>,
  'PATCH /v1/apps/:appId': {} as Endpoint<UpdateAppRequest, App>,
  'DELETE /v1/apps/:appId': {} as Endpoint<void, { ok: true }>,

  'GET /v1/apps/:appId/write-keys': {} as Endpoint<void, ReadonlyArray<WriteKey>>,
  'POST /v1/apps/:appId/write-keys': {} as Endpoint<CreateWriteKeyRequest, CreatedWriteKey>,
  'POST /v1/apps/:appId/write-keys/:keyId/rotate':
    {} as Endpoint<RotateWriteKeyRequest, RotateWriteKeyResponse>,
  'DELETE /v1/apps/:appId/write-keys/:keyId': {} as Endpoint<void, { ok: true }>,

  'GET /v1/apps/:appId/event-definitions': {} as Endpoint<void, ReadonlyArray<EventDefinition>>,
  'POST /v1/apps/:appId/event-definitions': {} as Endpoint<RegisterEventDefinitionRequest, EventDefinition>,
  'PATCH /v1/apps/:appId/event-definitions/:defId': {} as Endpoint<UpdateEventDefinitionRequest, EventDefinition>,

  'GET /v1/apps/:appId/segments': {} as Endpoint<void, ReadonlyArray<Segment>>,
  'POST /v1/apps/:appId/segments': {} as Endpoint<CreateSegmentRequest, Segment>,
  'GET /v1/apps/:appId/segments/:segId': {} as Endpoint<void, Segment>,
  'PATCH /v1/apps/:appId/segments/:segId': {} as Endpoint<Partial<CreateSegmentRequest>, Segment>,
  'DELETE /v1/apps/:appId/segments/:segId': {} as Endpoint<void, { ok: true }>,
  'POST /v1/apps/:appId/segments/:segId/preview': {} as Endpoint<void, SegmentPreview>,
  'POST /v1/apps/:appId/segments/:segId/rebuild': {} as Endpoint<void, { scheduled: true }>,
  'GET /v1/apps/:appId/users': {} as Endpoint<ListUsersQuery, ReadonlyArray<AppUserSummary>>,
  'GET /v1/apps/:appId/users/:anonymousId': {} as Endpoint<void, AppUserDetail>,
  'GET /v1/apps/:appId/users/:anonymousId/events': {} as Endpoint<ListUserEventsQuery, ReadonlyArray<AppUserEvent>>,
  'GET /v1/apps/:appId/users/:anonymousId/push': {} as Endpoint<
    void,
    {
      consent: { push: boolean; feedback: boolean; analytics: boolean; recordedAt: string | null }
      devices: ReadonlyArray<{
        id: string
        platform: 'ios' | 'android'
        environment: 'production' | 'sandbox'
        language: string | null
        timezone: string | null
        appVersion: string | null
        sdkVersion: string | null
        optIn: boolean
        lastSeenAt: string
        invalidatedAt: string | null
        createdAt: string
      }>
    }
  >,
  'POST /v1/apps/:appId/users/:anonymousId/push/test-send': {} as Endpoint<
    { title: string; body: string; imageUrl?: string; deepLink?: string },
    { dispatched: number; held: number; dropped: number; errors: ReadonlyArray<{ reason: string }> }
  >,

  'POST /v1/apps/:appId/segments/ai-generate-rules': {} as Endpoint<GenerateSegmentRulesRequest, GenerateSegmentRulesResponse>,
  'POST /v1/apps/:appId/segments/ai-generate-name': {} as Endpoint<GenerateSegmentNameRequest, GenerateSegmentNameResponse>,

  'GET /v1/apps/:appId/prompts': {} as Endpoint<void, ReadonlyArray<Prompt>>,
  'POST /v1/apps/:appId/prompts': {} as Endpoint<CreatePromptRequest, Prompt>,
  'GET /v1/apps/:appId/prompts/:promptId': {} as Endpoint<void, Prompt>,
  'PATCH /v1/apps/:appId/prompts/:promptId': {} as Endpoint<UpdatePromptRequest, Prompt>,
  'DELETE /v1/apps/:appId/prompts/:promptId': {} as Endpoint<void, { ok: true }>,
  'POST /v1/apps/:appId/prompts/:promptId/test-on-device': {} as Endpoint<TestPromptOnDeviceRequest, { dispatched: true }>,

  'GET /v1/apps/:appId/prompts/:promptId/responses': {} as Endpoint<ListResponsesQuery, ReadonlyArray<PromptResponse>>,
  'GET /v1/apps/:appId/prompts/:promptId/analytics': {} as Endpoint<void, PromptAnalytics>,

  // SDK-facing (authenticated via write key)
  'POST /v1/sdk/ingest': {} as Endpoint<SdkIngestRequest, SdkIngestResponse>,
  'GET /v1/sdk/armed-triggers': {} as Endpoint<{ anonymousId: string; externalId?: string }, SdkArmedTriggersResponse>,
  'POST /v1/sdk/consent': {} as Endpoint<SdkConsentPayload, { ok: true }>,
  'POST /v1/sdk/identify': {} as Endpoint<SdkIdentifyPayload, { ok: true }>,
  'POST /v1/sdk/responses': {} as Endpoint<SubmitResponsePayload, { ok: true }>,

  // GDPR
  'POST /v1/apps/:appId/gdpr/delete': {} as Endpoint<GdprDeleteRequest, { scheduled: true }>,
  'POST /v1/apps/:appId/gdpr/export': {} as Endpoint<GdprExportRequest, { scheduled: true; exportId: string }>,
  'GET /v1/apps/:appId/gdpr/exports/:exportId': {} as Endpoint<void, { status: 'pending' | 'running' | 'completed' | 'failed'; downloadUrl?: string }>,

  // Campaigns (push)
  'GET /v1/apps/:appId/campaigns': {} as Endpoint<void, ReadonlyArray<Campaign>>,
  'POST /v1/apps/:appId/campaigns': {} as Endpoint<CreateCampaignRequest, CampaignWithVariants>,
  'GET /v1/apps/:appId/campaigns/:cid': {} as Endpoint<void, CampaignWithVariants>,
  'PATCH /v1/apps/:appId/campaigns/:cid': {} as Endpoint<UpdateCampaignRequest, CampaignWithVariants>,
  'DELETE /v1/apps/:appId/campaigns/:cid': {} as Endpoint<void, { ok: true }>,
  'POST /v1/apps/:appId/campaigns/:cid/activate': {} as Endpoint<void, Campaign>,
  'POST /v1/apps/:appId/campaigns/:cid/pause': {} as Endpoint<void, Campaign>,
  'POST /v1/apps/:appId/campaigns/:cid/resend': {} as Endpoint<void, { queued: number }>,
  'POST /v1/apps/:appId/campaigns/:cid/preview': {} as Endpoint<{ anonymousId?: string; mergeTags?: Record<string, unknown> }, ReadonlyArray<{ variantId: string; language: string | null; title: string; body: string }>>,
  'POST /v1/apps/:appId/campaigns/:cid/test-send': {} as Endpoint<{ anonymousId: string }, { queued: true }>,
  'GET /v1/apps/:appId/campaigns/:cid/analytics': {} as Endpoint<void, CampaignAnalytics>,
  'GET /v1/apps/:appId/campaigns/:cid/deliveries': {} as Endpoint<void, ReadonlyArray<{ delivery_id: string; variant_id: string; language: string | null; anonymous_id: string; platform: string; sent_at: string; opened_at: string | null; clicked_at: string | null; error_code: string | null }>>,

  // Push credentials
  'GET /v1/apps/:appId/push/credentials': {} as Endpoint<void, ReadonlyArray<PushCredentialSummary>>,
  'POST /v1/apps/:appId/push/credentials': {} as Endpoint<UploadCredentialRequest, PushCredentialSummary>,
  'DELETE /v1/apps/:appId/push/credentials/:credId': {} as Endpoint<void, { ok: true }>,
  'GET /v1/apps/:appId/push/stats': {} as Endpoint<
    void,
    {
      credentials: { ios: boolean; android: boolean }
      deviceTokens: { total: number; ios: number; android: number }
      campaignCount: number
    }
  >,
  'GET /v1/apps/:appId/push/audience-estimate': {} as Endpoint<
    { segmentId?: string },
    { audienceSize: number; withPush: number; iosCount: number; androidCount: number }
  >,

  // Push device-token registration (SDK-facing, write-key auth)
  'POST /v1/sdk/push/register-token': {} as Endpoint<RegisterDeviceTokenPayload, { registered: true } | { skipped: 'consent' }>,
  'POST /v1/sdk/push/update-token': {} as Endpoint<UpdateDeviceTokenPayload, { updated: true }>,
  'POST /v1/sdk/push/invalidate-token': {} as Endpoint<InvalidateDeviceTokenPayload, { invalidated: true }>,

  // Transactional push (server API token auth)
  'POST /v1/apps/:appId/push/transactional': {} as Endpoint<PushTransactionalRequest, { queued: true; deliveryId: string; idempotent?: boolean }>,

  // Surveys — dashboard CRUD
  'GET /v1/apps/:appId/surveys': {} as Endpoint<void, ReadonlyArray<SurveyCampaign>>,
  'POST /v1/apps/:appId/surveys': {} as Endpoint<CreateSurveyRequest, SurveyCampaignWithFlow>,
  'GET /v1/apps/:appId/surveys/:sid': {} as Endpoint<void, SurveyCampaignWithFlow>,
  'PATCH /v1/apps/:appId/surveys/:sid': {} as Endpoint<UpdateSurveyRequest, SurveyCampaignWithFlow>,
  'DELETE /v1/apps/:appId/surveys/:sid': {} as Endpoint<void, { ok: true }>,
  'POST /v1/apps/:appId/surveys/:sid/activate': {} as Endpoint<void, SurveyCampaign>,
  'POST /v1/apps/:appId/surveys/:sid/pause': {} as Endpoint<void, SurveyCampaign>,
  'POST /v1/apps/:appId/surveys/:sid/archive': {} as Endpoint<void, SurveyCampaign>,
  'POST /v1/apps/:appId/surveys/:sid/preview': {} as Endpoint<
    { anonymousId?: string; mergeTags?: Record<string, unknown>; language?: string },
    SurveyCampaignWithFlow
  >,
  'POST /v1/apps/:appId/surveys/:sid/test-on-device': {} as Endpoint<{ anonymousId: string }, { dispatched: true }>,
  'GET /v1/apps/:appId/surveys/:sid/analytics': {} as Endpoint<void, SurveyAnalytics>,
  'GET /v1/apps/:appId/surveys/:sid/responses': {} as Endpoint<
    { from?: string; to?: string; page?: number; limit?: number; segmentId?: string; language?: string },
    ReadonlyArray<SurveyResponseRecord>
  >,
  'GET /v1/apps/:appId/surveys/:sid/attempts': {} as Endpoint<
    void,
    ReadonlyArray<{
      id: string
      campaignId: string
      anonymousId: string
      externalId: string | null
      startedAt: string
      completedAt: string | null
      abandonedAt: string | null
      currentQuestionId: string | null
      progressSnapshot: unknown
      source: string
      language: string | null
    }>
  >,
  'GET /v1/apps/:appId/surveys/:sid/share-link': {} as Endpoint<void, SurveyShareLinkResponse>,
  'GET /v1/apps/:appId/survey-templates': {} as Endpoint<void, ReadonlyArray<SurveyTemplate>>,
  'POST /v1/apps/:appId/surveys/from-template/:slug': {} as Endpoint<
    CloneSurveyFromTemplateRequest,
    SurveyCampaignWithFlow
  >,

  // Surveys — SDK-facing (write-key auth)
  'GET /v1/sdk/surveys/available': {} as Endpoint<
    { anonymousId: string; externalId?: string },
    { surveys: ReadonlyArray<SurveySummary> }
  >,
  'POST /v1/sdk/surveys/resolve-link': {} as Endpoint<ResolveSurveyLinkRequest, ResolveSurveyLinkResponse>,
  'GET /v1/sdk/surveys/:sid': {} as Endpoint<
    { anonymousId: string; externalId?: string; language?: string },
    SurveyCampaignWithFlow
  >,
  'POST /v1/sdk/surveys/:sid/attempts': {} as Endpoint<CreateSurveyAttemptRequest, CreateSurveyAttemptResponse>,
  'PATCH /v1/sdk/surveys/attempts/:attemptId': {} as Endpoint<UpdateSurveyAttemptProgressRequest, { ok: true }>,
  'POST /v1/sdk/surveys/attempts/:attemptId/responses': {} as Endpoint<SubmitSurveyAnswersRequest, { ok: true }>,
  'POST /v1/sdk/surveys/attempts/:attemptId/complete': {} as Endpoint<CompleteSurveyAttemptRequest, { ok: true }>,
  'POST /v1/sdk/surveys/attempts/:attemptId/abandon': {} as Endpoint<void, { ok: true }>,
} as const

export type EndpointKey = keyof typeof endpoints
