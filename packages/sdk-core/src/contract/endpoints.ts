import type * as Content from '../types/portal-content.js'
import type * as Mcp from '../types/mcp.js'
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
import type * as Portal from '../types/portal.js'
import type { SegmentDsl } from '../types/segment-dsl.js'
import type { AudienceSpec } from '../types/targeting.js'
import type { PromptResponse, SubmitResponsePayload } from '../types/response.js'
import type {
  FeedbackRecipient,
  InAppRecipient,
  RecipientList,
  RecipientPageQuery,
  SurveyRecipient,
} from '../types/recipient.js'
import type {
  App,
  ApiToken,
  CreatedApiToken,
  CreatedApp,
  CreateApiTokenRequest,
  CreatedWriteKey,
  RotateWriteKeyRequest,
  RotateWriteKeyResponse,
  User,
  Workspace,
  WorkspaceWithRole,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  WriteKey,
  AcceptWorkspaceInviteRequest,
  AcceptWorkspaceInviteResponse,
  AppOnboardingStatus,
  DeferCurrentUserOnboardingRequest,
  OnboardingGoal,
  UpdateAppOnboardingRequest,
} from '../types/workspace.js'
import type { Consent } from '../types/sdk.js'
import type {
  ConnectIntegrationRequest,
  IntegrationDeliveriesResponse,
  IntegrationSummary,
  IntegrationTestResult,
  UpdateIntegrationRequest,
} from '../types/integration.js'
import type {
  AdminWorkspaceSummary,
  BillingCheckoutRequest,
  BillingCheckoutResponse,
  BillingPlan,
  BillingUsage,
  BillingTrial,
  BillingPeriod,
  BillingOfferAvailability,
  BillingChangePlanRequest,
  BillingChangePlanResponse,
  Subscription,
} from '../types/billing.js'
import type {
  AdminActivityEntry,
  AdminDashboardUserListRequest,
  AdminDashboardUserListResponse,
  AdminDeletionJob,
  AdminCustomerDetail,
  AdminCustomerListRequest,
  AdminCustomerListResponse,
  AdminSession,
  DeleteAdminDashboardUserRequest,
  DeleteAdminWorkspaceRequest,
  CreateWorkspacePlanGrantRequest,
  EffectivePlanAccess,
  ExtendWorkspacePlanGrantRequest,
  RevokeWorkspacePlanGrantRequest,
  WorkspacePlanGrant,
  GlobalFeatureFlag,
  ProductFeatureFlags,
  UpdateGlobalFeatureFlagRequest,
} from '../types/admin.js'
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
  ArmedSurvey,
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
import type {
  ArmedInAppMessage,
  CreateInAppMessageRequest,
  InAppMessage,
  InAppMessageAnalytics,
  UpdateInAppMessageRequest,
} from '../types/inapp-message.js'
import type {
  Request,
  RequestStatus,
  RequestSummary,
  RequestDetail,
  RequestSearchResult,
  RequestVote,
  RequestFollow,
  GetRequestsOptions,
  GetRequestsResult,
  SubmitRequestPayload,
  RequestSettings,
  UpdateRequestSettingsRequest,
  UpdateRequestStatusRequest,
  UpdateRequestResponseRequest,
  UpdateRequestModerationRequest,
  MergeRequestsRequest,
  BulkUpdateStatusRequest,
  ListRequestsQuery,
  RequestUpvoterSegmentBreakdown,
  RequestTimelineEntry,
  RequestAnalytics,
  RequestPublicSummary,
  RequestPublicDetail,
  RequestPublicBranding,
  RequestComment,
  PostCommentPayload,
  EditCommentPayload,
} from '../types/request.js'
import type {
  AppBrandSettings,
  BrandTheme,
  CreateBrandThemeRequest,
  ThemeMode,
  UpdateBrandThemeDefaultsRequest,
  UpdateBrandThemeRequest,
} from '../types/brand.js'

// ---------- auth ----------
// Sign-in / sign-up / sign-out are handled by WorkOS AuthKit on the
// dashboard side. The API exposes only /v1/me to surface the locally
// mapped user + workspace state.

export interface UpdateCurrentUserRequest {
  readonly name?: string
}

// ---------- workspaces ----------

export interface CreateWorkspaceRequest {
  readonly name: string
  readonly slug?: string
  readonly timezone?: string
}

export interface UpdateWorkspaceRequest {
  readonly name?: string
  readonly timezone?: string
}

export interface InviteMemberRequest {
  readonly email: string
  readonly role: Exclude<WorkspaceRole, 'owner'>
}

// ---------- apps ----------

export interface CreateAppRequest {
  readonly setupMode?: 'sdk' | 'portal'
  readonly portal?: Portal.CreateAppPortal
  readonly webConfig?: App['webConfig']
  readonly name: string
  readonly slug?: string
  readonly platforms: App['platforms']
  readonly environment?: WriteKey['environment']
  readonly onboardingGoal?: OnboardingGoal
}

export interface UpdateAppRequest {
  readonly webConfig?: App['webConfig']
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
  // New segments persist `definition: AudienceSpec` (the same shape
  // feedback / surveys / push targeting use). `rules: SegmentDsl` is
  // accepted for back-compat — exactly one of the two must be set.
  readonly definition?: AudienceSpec
  readonly rules?: SegmentDsl
  readonly refreshMode?: 'hot' | 'cold' | 'manual'
}

export interface AppUserSummary {
  readonly origin?: 'sdk' | 'portal'
  readonly subjectId: string
  readonly anonymousId: string
  readonly anonymousIds: ReadonlyArray<string>
  readonly externalId?: string | null
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly eventCount?: number
  readonly topProperties?: Readonly<Record<string, string | number | boolean | null>>
  // Latest device-context fields surfaced from usergist.events (argMax
  // by occurred_at). Useful in the users list + user detail card.
  readonly country?: string | null
  readonly platform?: string | null
}

export interface AppUserDetail {
  readonly origin?: 'sdk' | 'portal'
  readonly subjectId: string
  readonly anonymousId: string
  readonly anonymousIds: ReadonlyArray<string>
  readonly externalId?: string | null
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly properties: Readonly<Record<string, string | number | boolean | null>>
  readonly eventCount: number
  readonly country?: string | null
  readonly platform?: string | null
}

export interface AppUserEvent {
  readonly id: string
  readonly name: string
  readonly occurredAt: string
  readonly properties: Readonly<Record<string, unknown>>
  readonly platform?: string | null
  readonly appVersion?: string | null
}

export interface PaginatedAppUsers {
  readonly items: ReadonlyArray<AppUserSummary>
  readonly total: number
  readonly nextCursor: string | null
}

export interface PaginatedAppUserEvents {
  readonly items: ReadonlyArray<AppUserEvent>
  readonly nextCursor: string | null
}

export interface ListUsersQuery {
  readonly q?: string
  readonly identityKind?: 'anonymous' | 'identified'
  readonly origin?: 'sdk' | 'portal'
  readonly cursor?: string
  readonly limit?: number
}

export interface ListUserEventsQuery {
  readonly from?: string
  readonly to?: string
  readonly cursor?: string
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
  readonly deliveryPlatforms?: ReadonlyArray<import('../types/web.js').DeliveryPlatform>
  readonly webPresentation?: import('../types/web.js').WebPresentation | null
  readonly themeMode?: ThemeMode
  readonly theme?: PromptTheme
  readonly frequency?: FrequencyCaps
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly status?: PromptStatus
}

export interface UpdatePromptRequest {
  readonly name?: string
  readonly triggerEventName?: string
  readonly segmentId?: string | null
  readonly questions?: ReadonlyArray<Question>
  readonly deliveryPlatforms?: ReadonlyArray<import('../types/web.js').DeliveryPlatform>
  readonly webPresentation?: import('../types/web.js').WebPresentation | null
  readonly themeMode?: ThemeMode
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

export interface SdkArmedInAppMessagesResponse {
  readonly messages: ReadonlyArray<ArmedInAppMessage>
  readonly serverTime: string
  readonly nextSyncMs: number
}

export interface SdkArmedSurveysResponse {
  readonly surveys: ReadonlyArray<ArmedSurvey>
  readonly serverTime: string
  readonly nextSyncMs: number
}

export interface SdkConsentPayload {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly purposes: Consent
  readonly version: number
  readonly effectiveAt: string
}

export interface SdkSessionResponse {
  readonly subjectToken: string
  readonly subjectId: string
  readonly expiresAt: string
}

export interface SdkIdentifyPayload {
  readonly anonymousId: string
  readonly externalId: string
  readonly properties?: Record<string, string | number | boolean | null>
}

export interface RegisterSdkClientRequest {
  readonly anonymousId:string
  readonly instanceId:string
  readonly platform:import('../types/web.js').DeliveryPlatform
  readonly sdkVersion:string
  readonly protocolVersion:2
  readonly screenName?:string|null
}
export interface SdkDeliveryInstruction {
  readonly id:number
  readonly type:string
  readonly payload:Readonly<Record<string,unknown>>
  readonly emittedAt:string
  readonly expiresAt:string
}
export interface AuthorizePresentationRequest {
  readonly clientId:string
  readonly pillar:'feedback'|'survey'|'inapp'
  readonly campaignId:string
  readonly idempotencyKey:string
  readonly instructionId?:number
  readonly screenName?:string
}
export type AuthorizePresentationResponse = {
  readonly status:'authorized'
  readonly presentationId:string
  readonly content:Prompt|import('../types/survey.js').SurveyCampaignWithFlow|import('../types/inapp-message.js').InAppMessage
}|{readonly status:'unavailable'|'consent_required'}

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
  'GET /v1/apps/:appId/search': {} as Endpoint<Mcp.AppSearchQuery, Mcp.AppSearchResult>,
  'POST /v1/apps/:appId/delivery-diagnostics': {} as Endpoint<Mcp.DeliveryDiagnosticInput, Mcp.DeliveryDiagnosticResult>,
  'GET /v1/workspaces/:wid/portal': {} as Endpoint<void, Portal.PortalSettings>,
  'PUT /v1/workspaces/:wid/portal': {} as Endpoint<Portal.UpdatePortalRequest, Portal.PortalSettings>,
  'GET /v1/workspaces/:wid/portal/slug-available': {} as Endpoint<{ slug: string }, { available: boolean }>,
  'PUT /v1/workspaces/:wid/portal/apps/:appId': {} as Endpoint<Portal.UpdatePortalAppRequest, Portal.PortalSettings>,
  'POST /v1/workspaces/:wid/portal/publish': {} as Endpoint<void, Portal.PortalSettings>,
  'POST /v1/workspaces/:wid/portal/unpublish': {} as Endpoint<void, Portal.PortalSettings>,
  'GET /v1/workspaces/:wid/portal/preview/:appId': {} as Endpoint<Portal.PortalRequestQuery, Portal.PortalRequestList>,
  'PATCH /v1/apps/:appId/requests/portal-visibility': {} as Endpoint<{ ids: readonly string[]; visible: boolean }, { updated: number }>,
  'GET /v1/portal/:portalSlug': {} as Endpoint<void, Portal.PublicPortal>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/requests': {} as Endpoint<Portal.PortalRequestQuery, Portal.PortalRequestList>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/requests/counts': {} as Endpoint<void, Portal.PortalRequestCounts>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/requests/:requestId': {} as Endpoint<void, Portal.PortalRequest>,
  'POST /v1/portal/:portalSlug/auth/start': {} as Endpoint<Portal.PortalAuthStart, { sent: true; retryAfter: number }>,
  'POST /v1/portal/:portalSlug/auth/verify': {} as Endpoint<Portal.PortalAuthVerify, Portal.PortalSession & { sessionToken: string }>,
  'GET /v1/portal/:portalSlug/session': {} as Endpoint<void, Portal.PortalSession | null>,
  'DELETE /v1/portal/:portalSlug/session': {} as Endpoint<void, { signedOut: true }>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/votes': {} as Endpoint<{ ids: string }, { votedIds: string[] }>,
  'POST /v1/portal/:portalSlug/apps/:appSlug/requests': {} as Endpoint<Portal.PortalSubmission, Portal.PortalRequest>,
  'PUT /v1/portal/:portalSlug/apps/:appSlug/requests/:requestId/vote': {} as Endpoint<Portal.PortalVote, { upvoted: boolean; upvoteCount: number }>,
  'POST /v1/sdk/clients': {} as Endpoint<RegisterSdkClientRequest,{clientId:string;protocolVersion:2}>,
  'POST /v1/sdk/clients/:id/end': {} as Endpoint<Record<string,never>,{ok:true}>,
  'GET /v1/sdk/clients/:id/instructions': {} as Endpoint<void,{instructions:ReadonlyArray<SdkDeliveryInstruction>}>,
  'POST /v1/sdk/presentations/authorize': {} as Endpoint<AuthorizePresentationRequest,AuthorizePresentationResponse>,
  'POST /v1/sdk/presentations/:id/receipt': {} as Endpoint<{clientId:string;event:'shown'|'dismissed'|'completed'|'cta_clicked'},{recorded:boolean}>,
  'GET /v1/me': {} as Endpoint<void, { user: User; workspaces: ReadonlyArray<WorkspaceWithRole> }>,
  'PATCH /v1/me': {} as Endpoint<UpdateCurrentUserRequest, User>,
  'PATCH /v1/me/onboarding': {} as Endpoint<DeferCurrentUserOnboardingRequest, User>,
  'GET /v1/features': {} as Endpoint<void, ProductFeatureFlags>,

  'GET /v1/workspaces': {} as Endpoint<void, ReadonlyArray<Workspace>>,
  'POST /v1/workspaces': {} as Endpoint<CreateWorkspaceRequest, Workspace>,
  'PATCH /v1/workspaces/:wid': {} as Endpoint<UpdateWorkspaceRequest, Workspace>,
  'GET /v1/workspaces/:wid/members': {} as Endpoint<void, ReadonlyArray<WorkspaceMember>>,
  'GET /v1/workspaces/:wid/invites': {} as Endpoint<void, ReadonlyArray<WorkspaceInvite>>,
  'POST /v1/workspaces/:wid/invites': {} as Endpoint<InviteMemberRequest, { queued: true }>,
  'DELETE /v1/workspaces/:wid/invites/:inviteId': {} as Endpoint<void, { revoked: true }>,
  'POST /v1/invites/accept': {} as Endpoint<
    AcceptWorkspaceInviteRequest,
    AcceptWorkspaceInviteResponse
  >,

  'GET /v1/workspaces/:wid/apps': {} as Endpoint<void, ReadonlyArray<App>>,
  'POST /v1/workspaces/:wid/apps': {} as Endpoint<CreateAppRequest, CreatedApp>,
  'GET /v1/workspaces/:wid/api-tokens': {} as Endpoint<void, ReadonlyArray<ApiToken>>,
  'GET /v1/workspaces/:wid/ai-connections': {} as Endpoint<void, Mcp.McpConnectionSettings>,
  'PATCH /v1/workspaces/:wid/ai-connections/:id': {} as Endpoint<Mcp.McpGrant & { policyVersion: number }, Mcp.McpConnection>,
  'POST /v1/workspaces/:wid/ai-connections/:id/revoke': {} as Endpoint<void, { revoked: boolean }>,
  'GET /v1/workspaces/:wid/ai-connections/:id/activity': {} as Endpoint<void, { items: Mcp.McpActivity[]; limit: number }>,
  'POST /v1/mcp/consent': {} as Endpoint<Mcp.McpGrant & { workspaceId: string; externalAuthId: string }, { redirectUri: string }>,
  'POST /v1/workspaces/:wid/api-tokens': {} as Endpoint<CreateApiTokenRequest, CreatedApiToken>,
  'DELETE /v1/workspaces/:wid/api-tokens/:tokenId': {} as Endpoint<void, { revoked: true }>,
  'GET /v1/apps/:appId': {} as Endpoint<void, App>,
  'PATCH /v1/apps/:appId': {} as Endpoint<UpdateAppRequest, App>,
  'DELETE /v1/apps/:appId': {} as Endpoint<void, { ok: true }>,
  'GET /v1/apps/:appId/onboarding': {} as Endpoint<void, AppOnboardingStatus>,
  'PATCH /v1/apps/:appId/onboarding': {} as Endpoint<UpdateAppOnboardingRequest, AppOnboardingStatus>,
  'POST /v1/apps/:appId/sdk/subject-tokens': {} as Endpoint<
    { externalId: string },
    SdkSessionResponse
  >,

  // ---------- outbound analytics integrations ----------
  'GET /v1/apps/:appId/integrations': {} as Endpoint<void, ReadonlyArray<IntegrationSummary>>,
  'PUT /v1/apps/:appId/integrations/:provider': {} as Endpoint<ConnectIntegrationRequest, { integration: IntegrationSummary; test: IntegrationTestResult }>,
  'PATCH /v1/apps/:appId/integrations/:provider': {} as Endpoint<UpdateIntegrationRequest, IntegrationSummary>,
  'POST /v1/apps/:appId/integrations/:provider/test': {} as Endpoint<Record<string, never>, IntegrationTestResult>,
  'POST /v1/apps/:appId/integrations/:provider/pause': {} as Endpoint<Record<string, never>, IntegrationSummary>,
  'POST /v1/apps/:appId/integrations/:provider/resume': {} as Endpoint<Record<string, never>, IntegrationSummary>,
  'DELETE /v1/apps/:appId/integrations/:provider': {} as Endpoint<void, { disconnected: true }>,
  'GET /v1/apps/:appId/integrations/:provider/deliveries': {} as Endpoint<{ cursor?: string; limit?: number }, IntegrationDeliveriesResponse>,

  'GET /v1/apps/:appId/brand-settings': {} as Endpoint<void, AppBrandSettings>,
  'POST /v1/apps/:appId/brand-themes': {} as Endpoint<CreateBrandThemeRequest, BrandTheme>,
  'PATCH /v1/apps/:appId/brand-themes/:themeId':
    {} as Endpoint<UpdateBrandThemeRequest, BrandTheme>,
  'DELETE /v1/apps/:appId/brand-themes/:themeId': {} as Endpoint<void, { ok: true }>,
  'PUT /v1/apps/:appId/brand-theme-defaults':
    {} as Endpoint<UpdateBrandThemeDefaultsRequest, AppBrandSettings>,

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
  'GET /v1/apps/:appId/users': {} as Endpoint<ListUsersQuery, PaginatedAppUsers>,
  'GET /v1/apps/:appId/users/:anonymousId': {} as Endpoint<void, AppUserDetail>,
  'GET /v1/apps/:appId/users/:anonymousId/events': {} as Endpoint<ListUserEventsQuery, PaginatedAppUserEvents>,
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
  'GET /v1/apps/:appId/prompts/:promptId/recipients': {} as Endpoint<
    RecipientPageQuery,
    RecipientList<FeedbackRecipient>
  >,
  'GET /v1/apps/:appId/prompts/:promptId/analytics': {} as Endpoint<
    { from?: string; to?: string },
    PromptAnalytics
  >,

  // App-level analytics rollup — daily (or hourly for 24h) buckets across all
  // four pillars. Used by the dashboard overview to render "last N days"
  // performance charts without spamming per-resource analytics endpoints.
  'GET /v1/apps/:appId/analytics/overview': {} as Endpoint<
    { range?: '24h' | '7d' | '30d' },
    {
      readonly range: '24h' | '7d' | '30d'
      readonly bucket: 'hour' | 'day'
      readonly buckets: ReadonlyArray<{
        readonly bucket: string
        readonly push: { sent: number; opened: number; clicked: number }
        readonly inapp: { impressions: number; dismissed: number; ctaClicked: number }
        readonly prompts: { shown: number; responded: number; dismissed: number }
        readonly surveys: { started: number; completed: number }
      }>
      readonly totals: {
        readonly push: { sent: number; opened: number; clicked: number }
        readonly inapp: { impressions: number; dismissed: number; ctaClicked: number }
        readonly prompts: { shown: number; responded: number; dismissed: number }
        readonly surveys: { started: number; completed: number }
      }
    }
  >,

  // Inline AudienceSpec preview — count of users matching the (unsaved) spec.
  // Used by the dashboard's TARGET step to power the live count badge.
  'POST /v1/apps/:appId/audience/preview': {} as Endpoint<
    import('../types/targeting.js').AudienceSpec,
    { matching: number; sampleUsers: ReadonlyArray<AppUserSummary> }
  >,

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
  'GET /v1/apps/:appId/campaigns/:cid/analytics': {} as Endpoint<
    { from?: string; to?: string },
    CampaignAnalytics
  >,
  'GET /v1/apps/:appId/campaigns/:cid/deliveries': {} as Endpoint<
    { limit?: number },
    ReadonlyArray<{
      delivery_id: string
      variant_id: string
      language: string | null
      anonymous_id: string
      external_id: string | null
      platform: string
      sent_at: string
      delivered_at: string | null
      displayed_at: string | null
      opened_at: string | null
      dismissed_at: string | null
      clicked_at: string | null
      error_code: string | null
      bounce_class: string
      provider_latency_ms: number
    }>
  >,

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
  'GET /v1/apps/:appId/push/reachability': {} as Endpoint<
    void,
    {
      optedIn: number
      reachable: number
      unreachable: number
      bouncedToday: number
      pingedToday: number
    }
  >,

  // Push channels (per-app NotificationChannel registry / iOS category id)
  'GET /v1/apps/:appId/push/channels': {} as Endpoint<
    void,
    {
      channels: ReadonlyArray<{
        readonly app_id: string
        readonly channel_id: string
        readonly display_name: string
        readonly description: string | null
        readonly importance: number
        readonly default_sound: string | null
        readonly default_vibrate: boolean
        readonly default_badge: boolean
        readonly category: string
      }>
    }
  >,
  'PUT /v1/apps/:appId/push/channels': {} as Endpoint<
    {
      channelId: string
      displayName: string
      description?: string | null
      importance?: number
      defaultSound?: string | null
      defaultVibrate?: boolean
      defaultBadge?: boolean
      category?: 'transactional' | 'marketing' | 'silent' | 'digest' | 'alert'
    },
    { saved: true }
  >,
  'DELETE /v1/apps/:appId/push/channels/:channelId': {} as Endpoint<void, { archived: true }>,

  // Push outbound webhooks
  'GET /v1/apps/:appId/push/webhooks': {} as Endpoint<
    void,
    {
      webhooks: ReadonlyArray<{
        id: string
        url: string
        event_types: ReadonlyArray<string>
        active: boolean
        description: string | null
        last_success_at: string | null
        last_failure_at: string | null
        last_failure_reason: string | null
        created_at: string
        updated_at: string
      }>
    }
  >,
  'POST /v1/apps/:appId/push/webhooks': {} as Endpoint<
    {
      url: string
      eventTypes: ReadonlyArray<string>
      active?: boolean
      description?: string | null
    },
    { id: string; secret: string }
  >,
  'PATCH /v1/apps/:appId/push/webhooks/:webhookId': {} as Endpoint<
    Partial<{
      url: string
      eventTypes: ReadonlyArray<string>
      active: boolean
      description: string | null
    }>,
    { saved: true }
  >,
  'DELETE /v1/apps/:appId/push/webhooks/:webhookId': {} as Endpoint<void, { deleted: true }>,
  'POST /v1/apps/:appId/push/webhooks/:webhookId/rotate': {} as Endpoint<void, { secret: string }>,
  'POST /v1/apps/:appId/push/webhooks/:webhookId/test': {} as Endpoint<
    void,
    { success: boolean; statusCode: number; attempts: number; error?: string }
  >,

  // Push device-token registration (SDK-facing, write-key auth)
  'POST /v1/sdk/push/register-token': {} as Endpoint<RegisterDeviceTokenPayload, { registered: true } | { skipped: 'consent' }>,
  'POST /v1/sdk/push/update-token': {} as Endpoint<UpdateDeviceTokenPayload, { updated: true }>,
  'POST /v1/sdk/push/invalidate-token': {} as Endpoint<InvalidateDeviceTokenPayload, { invalidated: true }>,
  'POST /v1/sdk/push/rebind': {} as Endpoint<
    { anonymousId: string; externalId: string; token: string },
    { rebound: boolean }
  >,
  'POST /v1/sdk/push/app-open': {} as Endpoint<
    { anonymousId: string; occurredAt?: string },
    { recorded: true }
  >,
  'POST /v1/sdk/push/delivered': {} as Endpoint<
    { deliveryId: string; occurredAt?: string; attemptId?: string; actionButton?: string },
    { recorded: true }
  >,
  'POST /v1/sdk/push/displayed': {} as Endpoint<
    { deliveryId: string; occurredAt?: string; attemptId?: string; actionButton?: string },
    { recorded: true }
  >,
  'POST /v1/sdk/push/dismissed': {} as Endpoint<
    { deliveryId: string; occurredAt?: string; attemptId?: string; actionButton?: string },
    { recorded: true }
  >,
  'POST /v1/sdk/push/silent-ack': {} as Endpoint<
    { pingId: string; anonymousId: string; receivedAt?: string },
    { recorded: true; pingId: string }
  >,
  'GET /v1/sdk/push/channels': {} as Endpoint<
    void,
    { channels: ReadonlyArray<unknown> }
  >,
  'POST /v1/sdk/push/channels/subscription': {} as Endpoint<
    { anonymousId: string; channelId: string; subscribed: boolean },
    { saved: true }
  >,

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
  'GET /v1/apps/:appId/surveys/:sid/analytics': {} as Endpoint<
    { from?: string; to?: string },
    SurveyAnalytics
  >,
  'GET /v1/apps/:appId/surveys/:sid/responses': {} as Endpoint<
    { from?: string; to?: string; page?: number; limit?: number; segmentId?: string; language?: string },
    ReadonlyArray<SurveyResponseRecord>
  >,
  'GET /v1/apps/:appId/surveys/:sid/recipients': {} as Endpoint<
    RecipientPageQuery,
    RecipientList<SurveyRecipient>
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

  // ---------- in-app messages (4th pillar) ----------
  'GET /v1/apps/:appId/inapp-messages': {} as Endpoint<void, ReadonlyArray<InAppMessage>>,
  'POST /v1/apps/:appId/inapp-messages': {} as Endpoint<CreateInAppMessageRequest, InAppMessage>,
  'GET /v1/apps/:appId/inapp-messages/:id': {} as Endpoint<void, InAppMessage>,
  'PATCH /v1/apps/:appId/inapp-messages/:id': {} as Endpoint<UpdateInAppMessageRequest, InAppMessage>,
  'DELETE /v1/apps/:appId/inapp-messages/:id': {} as Endpoint<void, { ok: true }>,
  'POST /v1/apps/:appId/inapp-messages/:id/activate': {} as Endpoint<void, InAppMessage>,
  'POST /v1/apps/:appId/inapp-messages/:id/pause': {} as Endpoint<void, InAppMessage>,
  'GET /v1/apps/:appId/inapp-messages/:id/analytics': {} as Endpoint<
    { from?: string; to?: string },
    InAppMessageAnalytics
  >,
  'GET /v1/apps/:appId/inapp-messages/:id/recipients': {} as Endpoint<
    RecipientPageQuery,
    RecipientList<InAppRecipient>
  >,
  'GET /v1/sdk/armed-inapp-messages': {} as Endpoint<
    { anonymousId: string; externalId?: string },
    SdkArmedInAppMessagesResponse
  >,

  // ---------- feature requests (5th pillar) — dashboard ----------
  'GET /v1/apps/:appId/requests': {} as Endpoint<ListRequestsQuery, ReadonlyArray<RequestSummary>>,
  'GET /v1/apps/:appId/requests/:requestId': {} as Endpoint<void, RequestDetail>,
  'PATCH /v1/apps/:appId/requests/:requestId/status':
    {} as Endpoint<UpdateRequestStatusRequest, RequestDetail>,
  'PUT /v1/apps/:appId/requests/:requestId/response':
    {} as Endpoint<UpdateRequestResponseRequest, RequestDetail>,
  'PATCH /v1/apps/:appId/requests/:requestId/moderation':
    {} as Endpoint<UpdateRequestModerationRequest, RequestDetail>,
  'POST /v1/apps/:appId/requests/merge':
    {} as Endpoint<MergeRequestsRequest, { canonicalId: string; mergedCount: number }>,
  'POST /v1/apps/:appId/requests/bulk/status':
    {} as Endpoint<BulkUpdateStatusRequest, { updated: number }>,
  'GET /v1/apps/:appId/requests/:requestId/upvoter-segments':
    {} as Endpoint<void, RequestUpvoterSegmentBreakdown>,
  'GET /v1/apps/:appId/requests/:requestId/timeline':
    {} as Endpoint<void, ReadonlyArray<RequestTimelineEntry>>,
  'GET /v1/apps/:appId/requests/:requestId/analytics':
    {} as Endpoint<{ from?: string; to?: string }, RequestAnalytics>,
  'GET /v1/apps/:appId/requests/:requestId/audience-spec':
    {} as Endpoint<void, { audience: AudienceSpec }>,
  'GET /v1/apps/:appId/request-settings': {} as Endpoint<void, RequestSettings>,
  'PUT /v1/apps/:appId/request-settings':
    {} as Endpoint<UpdateRequestSettingsRequest, RequestSettings>,
  'GET /v1/apps/:appId/request-settings/slug-available':
    {} as Endpoint<{ slug: string }, { available: boolean }>,
  /** Multipart `file` field; the processed logo URL is saved into branding.logoUrl. */
  'POST /v1/apps/:appId/request-settings/logo': {} as Endpoint<{ file: Blob }, RequestSettings>,
  'DELETE /v1/apps/:appId/request-settings/logo': {} as Endpoint<void, RequestSettings>,
  'POST /v1/apps/:appId/requests/seed-segments': {} as Endpoint<void, { created: number }>,

  // ---------- feature requests — SDK (write-key) ----------
  'GET /v1/sdk/requests': {} as Endpoint<
    GetRequestsOptions & { anonymousId: string; externalId?: string },
    GetRequestsResult
  >,
  'GET /v1/sdk/request-branding': {} as Endpoint<
    void,
    {
      readonly entryLabel: string
      readonly accentColor: string | null
      readonly logoUrl: string | null
      readonly introCopy: string | null
    }
  >,
  'GET /v1/sdk/requests/search': {} as Endpoint<
    { q: string; anonymousId: string; externalId?: string; limit?: number },
    { results: ReadonlyArray<RequestSearchResult> }
  >,
  'GET /v1/sdk/requests/:requestId': {} as Endpoint<
    { anonymousId: string; externalId?: string },
    Request
  >,
  'POST /v1/sdk/requests': {} as Endpoint<SubmitRequestPayload, Request>,
  'POST /v1/sdk/requests/:requestId/vote': {} as Endpoint<
    { anonymousId: string; externalId?: string | null; vote: boolean },
    RequestVote
  >,
  'POST /v1/sdk/requests/:requestId/follow': {} as Endpoint<
    { anonymousId: string; externalId?: string | null; follow: boolean },
    RequestFollow
  >,

  // ---------- feature requests — comments ----------
  // Dashboard (cookie auth)
  'GET /v1/apps/:appId/requests/:requestId/comments': {} as Endpoint<
    void,
    { items: ReadonlyArray<RequestComment> }
  >,
  'DELETE /v1/apps/:appId/requests/:requestId/comments/:commentId': {} as Endpoint<
    void,
    { ok: true }
  >,

  // SDK (write-key)
  'GET /v1/sdk/requests/:requestId/comments': {} as Endpoint<
    { anonymousId: string; externalId?: string | null },
    { items: ReadonlyArray<RequestComment> }
  >,
  'POST /v1/sdk/requests/:requestId/comments': {} as Endpoint<
    PostCommentPayload,
    RequestComment
  >,
  'PATCH /v1/sdk/requests/:requestId/comments/:commentId': {} as Endpoint<
    EditCommentPayload,
    RequestComment
  >,
  'DELETE /v1/sdk/requests/:requestId/comments/:commentId': {} as Endpoint<
    { anonymousId: string },
    { ok: true }
  >,

  // ---------- billing (Paddle) ----------
  'GET /v1/workspaces/:wid/billing/plans': {} as Endpoint<
    void,
    { plans: ReadonlyArray<BillingPlan>; foundingOffer: BillingOfferAvailability }
  >,
  'GET /v1/workspaces/:wid/billing/subscription': {} as Endpoint<
    void,
    {
      subscription: Subscription | null
      plan: BillingPlan | null
      usage: BillingUsage
      access: EffectivePlanAccess
      trial: BillingTrial | null
    }
  >,
  'POST /v1/workspaces/:wid/billing/checkout': {} as Endpoint<
    BillingCheckoutRequest,
    BillingCheckoutResponse
  >,
  'POST /v1/workspaces/:wid/billing/portal': {} as Endpoint<
    void,
    { url: string }
  >,
  'POST /v1/workspaces/:wid/billing/change-plan': {} as Endpoint<
    BillingChangePlanRequest,
    BillingChangePlanResponse
  >,
  'GET /v1/workspaces/:wid/billing/periods': {} as Endpoint<
    void,
    { periods: ReadonlyArray<BillingPeriod> }
  >,

  // ---------- super admin ----------
  'GET /v1/admin/session': {} as Endpoint<void, AdminSession>,
  'GET /v1/admin/feature-flags': {} as Endpoint<void, ReadonlyArray<GlobalFeatureFlag>>,
  'PATCH /v1/admin/feature-flags/:key': {} as Endpoint<
    UpdateGlobalFeatureFlagRequest,
    GlobalFeatureFlag
  >,
  'GET /v1/admin/customers': {} as Endpoint<
    AdminCustomerListRequest,
    AdminCustomerListResponse
  >,
  'GET /v1/admin/customers/:workspaceId': {} as Endpoint<void, AdminCustomerDetail>,
  'POST /v1/admin/customers/:workspaceId/permanent-deletion': {} as Endpoint<
    DeleteAdminWorkspaceRequest,
    { job: AdminDeletionJob }
  >,
  'GET /v1/admin/dashboard-users': {} as Endpoint<
    AdminDashboardUserListRequest,
    AdminDashboardUserListResponse
  >,
  'POST /v1/admin/dashboard-users/:userId/permanent-deletion': {} as Endpoint<
    DeleteAdminDashboardUserRequest,
    { job: AdminDeletionJob }
  >,
  'GET /v1/admin/deletion-jobs/:jobId': {} as Endpoint<void, { job: AdminDeletionJob }>,
  'POST /v1/admin/deletion-jobs/:jobId/retry': {} as Endpoint<
    Record<string, never>,
    { job: AdminDeletionJob }
  >,
  'POST /v1/admin/customers/:workspaceId/billing-events/:eventId/replay': {} as Endpoint<
    Record<string, never>,
    { replayed: true }
  >,
  'POST /v1/admin/customers/:workspaceId/grants': {} as Endpoint<
    CreateWorkspacePlanGrantRequest,
    { grant: WorkspacePlanGrant }
  >,
  'POST /v1/admin/customers/:workspaceId/grants/:grantId/extend': {} as Endpoint<
    ExtendWorkspacePlanGrantRequest,
    { grant: WorkspacePlanGrant }
  >,
  'POST /v1/admin/customers/:workspaceId/grants/:grantId/revoke': {} as Endpoint<
    RevokeWorkspacePlanGrantRequest,
    { grant: WorkspacePlanGrant }
  >,
  'GET /v1/admin/activity': {} as Endpoint<
    { workspaceId?: string; action?: string; cursor?: string; limit?: number },
    { entries: ReadonlyArray<AdminActivityEntry>; nextCursor: string | null }
  >,
  'GET /v1/admin/workspaces': {} as Endpoint<
    void,
    { workspaces: ReadonlyArray<AdminWorkspaceSummary> }
  >,
  'GET /v1/admin/plans': {} as Endpoint<
    { grantable?: boolean },
    {
      plans: ReadonlyArray<BillingPlan>
      foundingOffer: BillingOfferAvailability
      paddleEnvironment: 'sandbox' | 'production'
      configuration: {
        apiKeyConfigured: boolean
        clientTokenConfigured: boolean
        webhookSecretConfigured: boolean
        enforcementMode: 'observe' | 'warn' | 'enforce'
        overageMode: 'observe' | 'charge'
      }
      bindings: ReadonlyArray<{
        planId: string
        baseReady: boolean
        overageReady: boolean
      }>
    }
  >,
  'GET /v1/admin/workspaces/:wid': {} as Endpoint<
    void,
    {
      workspace: { id: string; name: string; slug: string }
      subscription: Subscription | null
      plan: BillingPlan | null
      mau: number
      events: ReadonlyArray<{
        id: string
        event_type: string
        received_at: string
        processed_at: string | null
        processing_error: string | null
      }>
    }
  >,
  'POST /v1/admin/workspaces/:wid/plan': {} as Endpoint<
    { planId: string },
    { subscription: Subscription }
  >,

  // ---------- feature requests — public web roadmap (no auth) ----------
  'GET /v1/public/roadmap/:slug': {} as Endpoint<
    { status?: RequestStatus | ReadonlyArray<RequestStatus>; sort?: 'top' | 'newest' | 'recently_updated'; page?: number; limit?: number },
    { items: ReadonlyArray<RequestPublicSummary>; total: number }
  >,
  'GET /v1/public/roadmap/:slug/r/:requestId': {} as Endpoint<void, RequestPublicDetail>,
  'GET /v1/public/roadmap/:slug/branding': {} as Endpoint<void, RequestPublicBranding>,

  'GET /v1/apps/:appId/help/articles': {} as Endpoint<Content.ContentQuery, Content.ContentPage<Content.PortalDocument>>,
  'POST /v1/apps/:appId/help/articles': {} as Endpoint<Content.CreateDocument, Content.PortalDocument>,
  'GET /v1/apps/:appId/help/articles/:documentId': {} as Endpoint<void, Content.PortalDocument>,
  'PUT /v1/apps/:appId/help/articles/:documentId': {} as Endpoint<Content.SaveDocument, Content.PortalDocument>,
  'POST /v1/apps/:appId/help/articles/:documentId/lifecycle': {} as Endpoint<Content.ContentAction, Content.PortalDocument>,
  'GET /v1/apps/:appId/changelog': {} as Endpoint<Content.ContentQuery, Content.ContentPage<Content.PortalDocument>>,
  'POST /v1/apps/:appId/changelog': {} as Endpoint<Content.CreateDocument, Content.PortalDocument>,
  'GET /v1/apps/:appId/changelog/:documentId': {} as Endpoint<void, Content.PortalDocument>,
  'PUT /v1/apps/:appId/changelog/:documentId': {} as Endpoint<Content.SaveDocument, Content.PortalDocument>,
  'POST /v1/apps/:appId/changelog/:documentId/lifecycle': {} as Endpoint<Content.ContentAction, Content.PortalDocument>,
  'GET /v1/apps/:appId/help/collections': {} as Endpoint<Content.ContentQuery, Content.ContentPage<Content.HelpCollection>>,
  'POST /v1/apps/:appId/help/collections': {} as Endpoint<Content.CreateCollection, Content.HelpCollection>,
  'PATCH /v1/apps/:appId/help/collections/:collectionId': {} as Endpoint<Content.UpdateCollection, Content.HelpCollection>,
  'POST /v1/apps/:appId/help/collections/:collectionId/position': {} as Endpoint<Content.ReorderContent, { updated: boolean }>,
  'POST /v1/apps/:appId/help/articles/:documentId/position': {} as Endpoint<Content.ReorderContent, { updated: boolean }>,
  'GET /v1/apps/:appId/roadmap': {} as Endpoint<Content.RoadmapQuery, Content.ContentPage<Content.RoadmapCard>>,
  'POST /v1/apps/:appId/roadmap': {} as Endpoint<Content.CreateRoadmapItem, Content.RoadmapItem>,
  'GET /v1/apps/:appId/roadmap/:itemId': {} as Endpoint<void, Content.RoadmapItem>,
  'PUT /v1/apps/:appId/roadmap/:itemId': {} as Endpoint<Content.SaveRoadmapItem, Content.RoadmapItem>,
  'POST /v1/apps/:appId/roadmap/:itemId/status': {} as Endpoint<Content.MoveRoadmapItem, Content.RoadmapItem>,
  'POST /v1/apps/:appId/roadmap/:itemId/lifecycle': {} as Endpoint<Content.ContentAction, Content.RoadmapItem>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/help/collections': {} as Endpoint<Content.ContentQuery, Content.ContentPage<Content.HelpCollection>>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/help/collections/:collectionId': {} as Endpoint<void, Content.HelpCollection>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/help/articles': {} as Endpoint<Content.ContentQuery, Content.ContentPage<Content.PublicDocumentSummary>>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/help/articles/:documentId': {} as Endpoint<void, Content.PublicPortalDocument>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/changelog': {} as Endpoint<Content.ContentQuery, Content.ContentPage<Content.PublicDocumentSummary>>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/changelog/:documentId': {} as Endpoint<void, Content.PublicPortalDocument>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/roadmap': {} as Endpoint<Content.RoadmapQuery, Content.ContentPage<Content.RoadmapCard>>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/roadmap/:itemId': {} as Endpoint<void, Content.PublicRoadmapItem>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/requests/:requestId/changelog': {} as Endpoint<Content.ContentPageQuery, Content.ContentPage<Content.PublicDocumentSummary>>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/roadmap/:itemId/changelog': {} as Endpoint<Content.ContentPageQuery, Content.ContentPage<Content.PublicDocumentSummary>>,
  'GET /v1/apps/:appId/portal-content/link-targets': {} as Endpoint<Content.ContentLinkQuery, Content.ContentPage<Content.ContentLinkTarget>>,
  // Binary routes use multipart/stream transports, not the JSON client helper.
  'POST /v1/apps/:appId/portal-content/assets/:kind/:documentId': {} as Endpoint<Content.PortalAssetUpload, Content.PortalAsset>,
  'GET /v1/apps/:appId/portal-content/assets/:assetId': {} as Endpoint<void, Blob>,
  'GET /v1/portal/:portalSlug/apps/:appSlug/assets/:assetId': {} as Endpoint<void, Blob>,
} as const

export type EndpointKey = keyof typeof endpoints
