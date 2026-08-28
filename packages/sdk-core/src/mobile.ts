/**
 * Mobile-safe entry point. It deliberately excludes the dashboard/admin API
 * endpoint registry and every Zod schema so native bundles pay only for the
 * shared types, constants, and pure evaluators they execute on-device.
 */
export * from './types/event.js'
export * from './types/prompt.js'
export * from './types/segment.js'
export * from './types/segment-dsl.js'
export * from './types/response.js'
export * from './types/api.js'
export * from './types/sdk.js'
export * from './types/workspace.js'
export * from './types/campaign.js'
export * from './types/survey.js'
export * from './types/inapp-message.js'
export * from './types/request.js'
export * from './types/targeting.js'
export * from './types/themes.js'
export * from './types/brand.js'
export * from './constants/push-events.js'
export * from './types/push-runtime.js'
export * from './evaluate/segment.js'
export * from './evaluate/branch.js'
export * from './evaluate/periodic.js'

// SDK-only transport DTOs currently live beside the endpoint registry. Type-only
// re-exports disappear from the mobile runtime bundle, so they preserve shared
// contract typing without pulling the admin endpoint table or Zod schemas into
// React Native applications.
export type {
  SdkArmedInAppMessagesResponse,
  SdkArmedSurveysResponse,
  SdkArmedTriggersResponse,
  SdkConsentPayload,
  SdkIdentifyPayload,
  SdkIngestResponse,
  SdkSessionResponse,
} from './contract/endpoints.js'
