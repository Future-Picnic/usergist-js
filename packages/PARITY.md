# SDK Parity Matrix

Single source of truth for what each UserGist SDK ships. React Native is the
behavioral reference and the only launch-supported SDK. Native iOS, native
Android, and Flutter now implement the authenticated subject-session, durable
delivery, campaign, and native survey protocols; they remain experimental until
platform release and physical-device push gates pass.

Status legend:
- **full** — implemented + tested + at parity with the React Native reference.
- **partial** — implemented but missing edge cases noted in the row.
- **stub** — public API is declared but the body is a placeholder. Avoid in production.
- **missing** — not present in this SDK.

| API surface | React Native (reference) | iOS | Android | Flutter |
|---|---|---|---|---|
| `init(writeKey, options)` | full | partial | partial | partial |
| `identify(externalId, props, subjectToken)` | full | partial | partial | partial |
| `track(name, properties)` | full | partial | partial | partial |
| `setConsent({ analytics, feedback, push, survey })` | full | partial | partial | partial |
| `reset()` | full | partial | partial | partial |
| `flush()` | full | partial | partial | partial |
| `setDebug(enabled)` | full | partial | partial | partial |
| `setDiagnosticHandler(handler)` | full | partial | partial | partial |
| `setStorageAdapter(adapter)` | full | missing | missing | missing |
| `setThemeOverrides(theme)` | full | partial | partial | partial |
| `getAnonymousId()` | full | partial | partial | partial |
| `onPromptShown` / `onResponse` | full | partial | partial | partial |
| `onPushEvent(cb)` | full | partial | partial | partial |
| Push: `registerPushToken` / `invalidatePushToken` | full | partial | partial | partial |
| Push: `rebindPushToken` | full | partial | partial | partial |
| Push: `enablePush` / `disablePush` | full | missing | missing | missing |
| Push: `getPushPermissionStatus` | full | partial | missing | missing |
| Push: `setPushBadgeCount` | full | missing | missing | missing |
| Push: `getInitialPushNotification` | full | missing | missing | missing |
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
| Authenticated anonymous subject session + protected header | full | partial | partial | partial |
| Durable identify / feedback / survey mutation queue | full | partial | partial | partial |
| Durable instruction inbox (cursor + dedupe + ack) | full | partial | partial | partial |
| Stable event ids + mixed-identity batch isolation | full | partial | partial | partial |
| 21-character URL-safe anonymous ids on install/reset | full | partial | partial | partial |
| Persisted identify properties + bounded event history | full | partial | partial | partial |
| Armed prompt/survey/in-app caches + `clientSideEligible` gate | full | partial | partial | partial |
| Consent-aware `$app_open` / `$identify` lifecycle events | full | partial | partial | partial |
| Prompt/survey/in-app modal FIFO | full | partial | partial | partial |
| Request-scoped identify auth + conflict-only identity rotation | full | partial | partial | partial |
| Reset invalidates active SDK UI + pending survey delivery | full | partial | partial | partial |
| TLS pinning (`api.usergist.studio`, SPKI) | missing | partial | partial | partial |

## Implementation notes

- **Native surveys** — iOS (`NativeSurveyView` / `SurveyHost`), Android (`SurveyActivity`), and Flutter (`SurveyPresenter`) render the full question contract, local branching, validation, completion/abandon pending states, and relaunch-safe progress. `openSurvey` uses `GET /v1/sdk/surveys/{id}` plus the server-owned attempt endpoints, with cached armed content as the local-fire fast path.
- **Authenticated subjects and delivery** — every SDK creates or resumes an anonymous session at `/v1/sdk/session`, applies `X-UserGist-Subject-Token` to protected calls, and sends identify with a request-scoped replacement credential so concurrent calls keep the last confirmed subject. Installation identity rotates only after an explicit 401/403/409 credential conflict; transient session failures preserve anonymous identity and retry. All implementations isolate ingest batches by anonymous/external identity and poll the cursor-based instruction inbox only after local dedupe state is persisted.
- **Client-side campaigns** — only payloads explicitly marked `clientSideEligible` may fire without a server instruction. Prompt and survey segment/frequency rules use persisted identify properties and bounded event history. Matching server instructions are deduplicated by `triggerEventId`.
- **Modal ownership** — prompt, survey, and in-app campaign surfaces use one FIFO per SDK. A queued surface receives its lifecycle callback only when it actually reaches the screen. Reset drops queued surfaces, closes active SDK UI without inventing a user outcome, and prevents a cleared in-flight survey mutation from being reported as delivered.
- **Lifecycle consent invariant** — `$app_open` intentionally waits for feedback consent because it is also a local feedback-targeting trigger. It is persisted with the feedback purpose, so granting feedback consent is sufficient to evaluate and deliver it.
- **Native Requests pillar — drop-in UI on every platform**. Calling `UserGist.openRequestsBoard()` opens a fully-styled board / detail / submit / comments flow without any host-side UI code:
  - **RN**: a single root `<Modal presentationStyle="fullScreen">` mounted inside `<UserGistProvider>` — internal state machine swaps board / detail / submit views (no nested modals). Branding pulled from `getRequestBranding()`.
  - **iOS**: `RequestsBoardHost.swift` presents a `UIHostingController` modally over the topmost view controller.
  - **Android**: `RequestsBoardActivity` launched via `Intent`. Mode (board / detail) is carried in extras.
  - **Flutter**: `RequestsNavHost` mounted inside `UserGistProvider` (`MaterialApp.builder`) listens on a singleton stream; `UserGist.openRequestsBoard()` pushes a `MaterialPageRoute` onto the root navigator. No `BuildContext` required at the call site.
  All four SDKs wire the eight `/v1/sdk/requests/...` endpoints + `/v1/sdk/request-branding` through their existing HTTP transport with PATCH + DELETE helpers added for comment edit/delete. The optimistic cache (`RequestsCache.{swift,kt,dart}`) mirrors the RN invariants exactly: upvote auto-creates follow; un-upvote does NOT remove the follow.
- **Search-as-you-type** uses a 300ms debounce + sequence-number guard so stale in-flight requests are dropped. Identical semantics on all four platforms.
- **Persisted-queue schema versioning**: iOS uses a wrapped JSON envelope (`{version, events}`); Android & Flutter use a `{"version":1}` header line followed by NDJSON events. All three legacy-migrate bare-array snapshots on hydrate.
- **Secure storage**: React Native accepts a host-supplied asynchronous encrypted storage adapter before `init()`; otherwise ordinary state uses AsyncStorage while subject credentials and pending mutations use bundled Keychain/EncryptedSharedPreferences bridges. iOS uses Keychain (`kSecAttrAccessibleAfterFirstUnlock`), Android `EncryptedSharedPreferences`, and Flutter `flutter_secure_storage`. Credential-bearing state never falls back to plaintext; legacy plaintext credentials are usable only after successful secure migration.
- **Transport security**: React Native currently relies on platform HTTPS trust and does not implement application-level SPKI pinning. The experimental native SDK implementations have pinning code, but production pin provisioning and rotation have not been release-verified.

## CI guard (active)

`tools/check-parity.ts` runs on every PR (`pnpm parity`). The script:

1. Asserts that every public method on the RN reference (`packages/sdk-react-native/src/UserGist.ts`) appears as a row in this file.
2. Requires React Native launch features to remain `full` (the explicitly optional TLS-pinning capability may be `missing`) and validates every status value.
3. Verifies critical protocol markers in all four implementations: authenticated subject and SDK metadata headers, request-scoped identify credentials, conflict-only identity rotation, reset-safe mutation delivery, durable instruction/mutation state, the four consent purposes, client-eligibility gates, persisted user history, lifecycle events, and campaign modal serialization.

The `--allow` escape hatch remains available for an intentionally staged React Native row, but production merges must not use it.

## Out-of-band follow-ups

These items block promotion of the experimental SDKs to launch-supported status:

- **Native release verification** — publish/package checks, consumer-app release builds, and a runnable iOS SwiftPM XCTest scheme remain required before promotion.
- **Push configuration and devices** — configure real APNs/FCM credentials and validate delivery, opens, actions, silent acks, permission transitions, and token rotation on physical iOS and Android devices. High-level automatic enable/disable, badge, and initial-notification helpers are still missing outside React Native as shown above.
- **Cert-pin material** — production pin SHA-256 values must be set in the host app's environment (`USERGIST_TLS_PIN_LEAF`, `USERGIST_TLS_PIN_BACKUP`) before shipping. Empty pins fall back to system trust.
