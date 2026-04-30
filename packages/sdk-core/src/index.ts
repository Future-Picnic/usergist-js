/**
 * @ritmus/sdk-core — shared types, contract, and evaluators for the Ritmus
 * mobile-engagement platform. Consumed by the API server, the dashboard, and
 * every native SDK (RN/iOS/Android/Flutter).
 *
 * Three pillars share this package:
 *   - **Types** — Event, Prompt, Survey, Campaign, Segment, Response, etc.
 *     The single source of truth for shapes that cross the API boundary.
 *   - **Contract** — `endpoints` describes every HTTP method+path on the API.
 *     Dashboard/test clients build their typed wrappers from this object so
 *     compile-time errors flag drift before it ships.
 *   - **Evaluators** — `evaluateSegment(dsl, user, now)` and
 *     `nextQuestionId(flow, q, answers)` are pure functions used by both the
 *     server trigger engine and the SDK so client-side firing matches what
 *     the server would have done. Always pass an explicit `now` for parity.
 *
 * The package is published as dual ESM + CJS, fully tree-shakeable, with no
 * runtime dependencies.
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
export * from './types/targeting.js'
export * from './types/themes.js'
export * from './constants/push-events.js'
export * from './types/push-runtime.js'
export * from './evaluate/segment.js'
export * from './evaluate/branch.js'
export * from './contract/endpoints.js'
export * as schemas from './schemas/index.js'
