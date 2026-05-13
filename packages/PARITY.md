# SDK Parity Matrix

Single source of truth for what each Ritmus SDK ships. Updated whenever a public API lands or moves between **stub** → **partial** → **full**.

Status legend:
- **full** — implemented + tested + at parity with the React Native reference.
- **partial** — implemented but missing edge cases noted in the row.
- **stub** — public API is declared but the body is a placeholder. Avoid in production.
- **missing** — not present in this SDK.

| API surface | React Native (reference) | iOS | Android | Flutter |
|---|---|---|---|---|
| `init(writeKey, options)` | full | full | full | full |
| `identify(externalId, props)` | full | full | full | full |
| `track(name, properties)` | full | full | full | full |
| `setConsent({ feedback, push, survey })` | full | full | full | full |
| `reset()` | full | full | full | full |
| `flush()` | full | full | full | full |
| `setDebug(enabled)` | full | full | full | full |
| `setThemeOverrides(theme)` | full | full | full | full |
| `getAnonymousId()` | full | full | full | full |
| `onPromptShown` / `onResponse` | full | full | full | full |
| `onPushEvent(cb)` | full | full | full | full |
| Push: `registerPushToken` / `invalidatePushToken` | full | full | full | full |
| Push: `rebindPushToken` | full | full | full | full |
| Push: `enablePush` / `disablePush` | full | full | full | full |
| Push: `getPushPermissionStatus` | full | full | full | full |
| Push: `setPushBadgeCount` | full | full | full | full |
| Push: `getInitialPushNotification` | full | full | full | full |
| Push: `pushBeacon` / `pushAckSilent` | full | full | full | full |
| Push: `pushAppOpen` / `pushFetchChannels` / `pushSetChannelSubscription` | full | full | full | full |
| `setInAppHandlers({...})` | full | full | full | full |
| **Surveys** — `getAvailableSurveys()` | full | full | full | full |
| **Surveys** — `openSurvey(surveyId)` | full | full | full | full |
| **Surveys** — `setSurveyHandlers({...})` | full | full | full | full |
| **Surveys** — `handleSurveyDeepLink(uri)` | full | full | full | full |
| Save-and-resume across relaunches (surveys) | full | full | full | full |
| Branching evaluator (sdk-core `nextQuestionId`) | full | full | full | full |
| **Requests** — `openRequestsBoard()` | full | full | full | full |
| **Requests** — `openRequestDetail(requestId)` | full | full | full | full |
| **Requests** — `submitRequest(...)` | full | full | full | full |
| **Requests** — `getRequests(options)` | full | full | full | full |
| **Requests** — `getRequest(requestId)` | full | full | full | full |
| **Requests** — `voteOnRequest(requestId, vote)` | full | full | full | full |
| **Requests** — `followRequest(requestId, follow)` | full | full | full | full |
| **Requests** — `getComments(requestId)` | full | full | full | full |
| **Requests** — `postComment(requestId, body)` | full | full | full | full |
| **Requests** — `editComment(requestId, commentId, body)` | full | full | full | full |
| **Requests** — `deleteComment(requestId, commentId)` | full | full | full | full |
| **Requests** — `getRequestBranding()` | full | full | full | full |
| **Requests** — `setRequestsHandlers({...})` | full | full | full | full |
| Optimistic vote/follow rollback | full | full | full | full |
| Search-as-you-type (300ms debounce) | full | full | full | full |
| Persisted-queue schema versioning | full | full | full | full |
| Secure storage (identity + consent + push token) | full | full | full | full |
| TLS pinning (`api.ritmus.studio`, SPKI) | full | full | full | full |

## Implementation notes

- **iOS surveys** (`packages/sdk-ios/Sources/RitmusFeedback/Internal/Surveys/`) — native SwiftUI renderer (`SurveyView` / `SurveyHost`) drives questions through the local `BranchEvaluator`, persisting per-attempt progress via `SurveyStore`. On `openSurvey`, the runtime fetches the flow from `/v1/sdk/surveys/{id}/flow`, resumes the prior attempt if one exists, and presents the host modally.
- **Native Requests pillar — drop-in UI on every platform**. Calling `Ritmus.openRequestsBoard()` opens a fully-styled board / detail / submit / comments flow without any host-side UI code:
  - **RN**: a single root `<Modal presentationStyle="fullScreen">` mounted inside `<RitmusProvider>` — internal state machine swaps board / detail / submit views (no nested modals). Branding pulled from `getRequestBranding()`.
  - **iOS**: `RequestsBoardHost.swift` presents a `UIHostingController` modally over the topmost view controller.
  - **Android**: `RequestsBoardActivity` launched via `Intent`. Mode (board / detail) is carried in extras.
  - **Flutter**: `RequestsNavHost` mounted inside `RitmusProvider` (`MaterialApp.builder`) listens on a singleton stream; `Ritmus.openRequestsBoard()` pushes a `MaterialPageRoute` onto the root navigator. No `BuildContext` required at the call site.
  All four SDKs wire the eight `/v1/sdk/requests/...` endpoints + `/v1/sdk/request-branding` through their existing HTTP transport with PATCH + DELETE helpers added for comment edit/delete. The optimistic cache (`RequestsCache.{swift,kt,dart}`) mirrors the RN invariants exactly: upvote auto-creates follow; un-upvote does NOT remove the follow.
- **Search-as-you-type** uses a 300ms debounce + sequence-number guard so stale in-flight requests are dropped. Identical semantics on all four platforms.
- **Persisted-queue schema versioning**: iOS uses a wrapped JSON envelope (`{version, events}`); Android & Flutter use a `{"version":1}` header line followed by NDJSON events. All three legacy-migrate bare-array snapshots on hydrate.
- **Secure storage**: iOS Keychain (`kSecAttrAccessibleAfterFirstUnlock`), Android `EncryptedSharedPreferences`, Flutter `flutter_secure_storage`. Plaintext rows from prior installs are migrated once on first launch.
- **TLS pinning**: `api.ritmus.studio` is pinned against two SHA-256 SPKI hashes sourced from `RITMUS_TLS_PIN_LEAF` / `RITMUS_TLS_PIN_BACKUP` environment variables. Localhost / preview hosts are unpinned so dev workflows still work. Pin rotation requires shipping the new backup pin in a build before retiring the leaf.

## CI guard (active)

`tools/check-parity.ts` runs on every PR (`pnpm parity`). The script:

1. Asserts that every public method on the RN reference (`packages/sdk-react-native/src/Ritmus.ts`) appears as a row in this file.
2. Asserts that every iOS / Android / Flutter cell reads exactly `full`.

Staged work can be granted a one-PR exemption with `pnpm parity --allow=<row-label-substring>`; production merges must not use the flag.

## Out-of-band follow-ups

These items did NOT block the cross-platform parity flip and are tracked separately:

- **iOS UIKit availability under SwiftPM** — `swift build` on macOS without an iOS SDK reports "no such module 'UIKit'" for `AppLifecycle.swift` and related host-app touchpoints. Real iOS builds via `xcodebuild` are unaffected.
- **Cert-pin material** — production pin SHA-256 values must be set in the host app's environment (`RITMUS_TLS_PIN_LEAF`, `RITMUS_TLS_PIN_BACKUP`) before shipping. Empty pins fall back to system trust.
