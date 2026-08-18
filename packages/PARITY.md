# SDK Parity Matrix

Single source of truth for what each userGist SDK ships. React Native is the only launch-supported SDK. Native iOS, native Android, and Flutter remain experimental until they implement the authenticated subject-session and durable instruction protocol and pass platform release tests.

Status legend:
- **full** — implemented + tested + at parity with the React Native reference.
- **partial** — implemented but missing edge cases noted in the row.
- **stub** — public API is declared but the body is a placeholder. Avoid in production.
- **missing** — not present in this SDK.

| API surface | React Native (reference) | iOS | Android | Flutter |
|---|---|---|---|---|
| `init(writeKey, options)` | full | partial | partial | partial |
| `identify(externalId, props)` | full | partial | partial | partial |
| `track(name, properties)` | full | partial | partial | partial |
| `setConsent({ feedback, push, survey })` | full | partial | partial | partial |
| `reset()` | full | partial | partial | partial |
| `flush()` | full | partial | partial | partial |
| `setDebug(enabled)` | full | partial | partial | partial |
| `setDiagnosticHandler(handler)` | full | missing | missing | missing |
| `setStorageAdapter(adapter)` | full | missing | missing | missing |
| `setThemeOverrides(theme)` | full | partial | partial | partial |
| `getAnonymousId()` | full | partial | partial | partial |
| `onPromptShown` / `onResponse` | full | partial | partial | partial |
| `onPushEvent(cb)` | full | partial | partial | partial |
| Push: `registerPushToken` / `invalidatePushToken` | full | partial | partial | partial |
| Push: `rebindPushToken` | full | partial | partial | partial |
| Push: `enablePush` / `disablePush` | full | partial | partial | partial |
| Push: `getPushPermissionStatus` | full | partial | partial | partial |
| Push: `setPushBadgeCount` | full | partial | partial | partial |
| Push: `getInitialPushNotification` | full | partial | partial | partial |
| Push: `pushBeacon` / `pushAckSilent` | full | partial | partial | partial |
| Push: `pushAppOpen` / `pushFetchChannels` / `pushSetChannelSubscription` | full | partial | partial | partial |
| `setInAppHandlers({...})` | full | partial | partial | partial |
| **Surveys** — `getAvailableSurveys()` | full | partial | partial | partial |
| **Surveys** — `openSurvey(surveyId)` | full | partial | partial | partial |
| **Surveys** — `setSurveyHandlers({...})` | full | partial | partial | partial |
| **Surveys** — `handleSurveyDeepLink(uri)` | full | partial | partial | partial |
| Save-and-resume across relaunches (surveys) | full | partial | partial | partial |
| Branching evaluator (sdk-core `nextQuestionId`) | full | partial | partial | partial |
| **Requests** — `openRequestsBoard()` | full | partial | partial | partial |
| **Requests** — `openRequestDetail(requestId)` | full | partial | partial | partial |
| **Requests** — `submitRequest(...)` | full | partial | partial | partial |
| **Requests** — `getRequests(options)` | full | partial | partial | partial |
| **Requests** — `getRequest(requestId)` | full | partial | partial | partial |
| **Requests** — `voteOnRequest(requestId, vote)` | full | partial | partial | partial |
| **Requests** — `followRequest(requestId, follow)` | full | partial | partial | partial |
| **Requests** — `getComments(requestId)` | full | partial | partial | partial |
| **Requests** — `postComment(requestId, body)` | full | partial | partial | partial |
| **Requests** — `editComment(requestId, commentId, body)` | full | partial | partial | partial |
| **Requests** — `deleteComment(requestId, commentId)` | full | partial | partial | partial |
| **Requests** — `getRequestBranding()` | full | partial | partial | partial |
| **Requests** — `setRequestsHandlers({...})` | full | partial | partial | partial |
| Optimistic vote/follow rollback | full | partial | partial | partial |
| Search-as-you-type (300ms debounce) | full | partial | partial | partial |
| Persisted-queue schema versioning | full | partial | partial | partial |
| Secure storage (identity + consent + push token) | full | partial | partial | partial |
| TLS pinning (`api.usergist.studio`, SPKI) | missing | partial | partial | partial |

## Implementation notes

- **iOS surveys** (`packages/sdk-ios/Sources/UserGistFeedback/Internal/Surveys/`) — native SwiftUI renderer (`SurveyView` / `SurveyHost`) drives questions through the local `BranchEvaluator`, persisting per-attempt progress via `SurveyStore`. On `openSurvey`, the runtime fetches the flow from `/v1/sdk/surveys/{id}/flow`, resumes the prior attempt if one exists, and presents the host modally.
- **Native Requests pillar — drop-in UI on every platform**. Calling `UserGist.openRequestsBoard()` opens a fully-styled board / detail / submit / comments flow without any host-side UI code:
  - **RN**: a single root `<Modal presentationStyle="fullScreen">` mounted inside `<UserGistProvider>` — internal state machine swaps board / detail / submit views (no nested modals). Branding pulled from `getRequestBranding()`.
  - **iOS**: `RequestsBoardHost.swift` presents a `UIHostingController` modally over the topmost view controller.
  - **Android**: `RequestsBoardActivity` launched via `Intent`. Mode (board / detail) is carried in extras.
  - **Flutter**: `RequestsNavHost` mounted inside `UserGistProvider` (`MaterialApp.builder`) listens on a singleton stream; `UserGist.openRequestsBoard()` pushes a `MaterialPageRoute` onto the root navigator. No `BuildContext` required at the call site.
  All four SDKs wire the eight `/v1/sdk/requests/...` endpoints + `/v1/sdk/request-branding` through their existing HTTP transport with PATCH + DELETE helpers added for comment edit/delete. The optimistic cache (`RequestsCache.{swift,kt,dart}`) mirrors the RN invariants exactly: upvote auto-creates follow; un-upvote does NOT remove the follow.
- **Search-as-you-type** uses a 300ms debounce + sequence-number guard so stale in-flight requests are dropped. Identical semantics on all four platforms.
- **Persisted-queue schema versioning**: iOS uses a wrapped JSON envelope (`{version, events}`); Android & Flutter use a `{"version":1}` header line followed by NDJSON events. All three legacy-migrate bare-array snapshots on hydrate.
- **Secure storage**: React Native accepts a host-supplied asynchronous encrypted storage adapter before `init()`; otherwise it defaults to AsyncStorage. iOS uses Keychain (`kSecAttrAccessibleAfterFirstUnlock`), Android `EncryptedSharedPreferences`, and Flutter `flutter_secure_storage`. Plaintext rows from prior native-SDK installs are migrated once on first launch.
- **Transport security**: React Native currently relies on platform HTTPS trust and does not implement application-level SPKI pinning. The experimental native SDK implementations have pinning code, but production pin provisioning and rotation have not been release-verified.

## CI guard (active)

`tools/check-parity.ts` runs on every PR (`pnpm parity`). The script:

1. Asserts that every public method on the RN reference (`packages/sdk-react-native/src/UserGist.ts`) appears as a row in this file.
2. Requires React Native launch features to remain `full` (the explicitly optional TLS-pinning capability may be `missing`) and validates every status value. Experimental SDKs are allowed to report `partial`, `stub`, or `missing`.

The `--allow` escape hatch remains available for an intentionally staged React Native row, but production merges must not use it.

## Out-of-band follow-ups

These items block promotion of the experimental SDKs to launch-supported status:

- **iOS UIKit availability under SwiftPM** — `swift build` on macOS without an iOS SDK reports "no such module 'UIKit'" for `AppLifecycle.swift` and related host-app touchpoints. Real iOS builds via `xcodebuild` are unaffected.
- **Cert-pin material** — production pin SHA-256 values must be set in the host app's environment (`USERGIST_TLS_PIN_LEAF`, `USERGIST_TLS_PIN_BACKUP`) before shipping. Empty pins fall back to system trust.
