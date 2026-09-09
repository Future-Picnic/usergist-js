# SDK Parity Matrix

Single source of truth for what each production UserGist SDK ships. React
Native remains the behavioral reference; native iOS, native Android, and
Flutter implement the same authenticated subject-session, durable delivery,
campaign, feature-request, and survey protocols with platform-native push APIs.

Status legend:
- **full** — implemented + tested + at parity with the React Native reference.
- **partial** — implemented but missing edge cases noted in the row.
- **stub** — public API is declared but the body is a placeholder. Avoid in production.
- **missing** — not present in this SDK.

| API surface | React Native (reference) | iOS | Android | Flutter |
|---|---|---|---|---|
| `init(...)` / `initAsync(...)` | full | full | full | full |
| `identify(...)` / `identifyAsync(...)` | full | full | full | full |
| `track(name, properties)` | full | full | full | full |
| `setUserProperties(properties, unset)` | full | missing | missing | missing |
| Online dynamic personalization (`personalization.v1`) | full | missing | missing | missing |
| Primary push tap JSON (`push.json-open.v1`) | full | missing | missing | missing |
| `setConsent({ analytics, feedback, push, survey })` | full | full | full | full |
| `reset()` | full | full | full | full |
| `flush()` | full | full | full | full |
| `setDebug(enabled)` | full | full | full | full |
| `setDiagnosticHandler(handler)` | full | full | full | full |
| `setStorageAdapter(adapter)` | full | missing | missing | missing |
| `setThemeOverrides(theme)` | full | full | full | full |
| `getAnonymousId()` / `getExternalId()` | full | full | full | full |
| `onPromptShown` / `onResponse` | full | full | full | full |
| `onPushEvent(cb)` | full | full | full | full |
| Push: `registerPushToken` / `invalidatePushToken` | full | full | full | full |
| Push: `rebindPushToken` | full | full | full | full |
| Push: `enablePush` / `disablePush` | full | missing | missing | missing |
| Push: `getPushPermissionStatus` | full | full | missing | missing |
| Push: `setPushBadgeCount` | full | missing | missing | missing |
| Push: `getInitialPushNotification` | full | missing | missing | missing |
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
| Authenticated anonymous subject session + protected header | full | full | full | full |
| Durable identify / feedback / survey mutation queue | full | full | full | full |
| Durable instruction inbox (cursor + dedupe + ack) | full | full | full | full |
| Stable event ids + mixed-identity batch isolation | full | full | full | full |
| 21-character URL-safe anonymous ids on install/reset | full | full | full | full |
| Persisted identify properties + bounded event history | full | full | full | full |
| Armed prompt/survey/in-app caches + `clientSideEligible` gate | full | full | full | full |
| Consent-aware `$app_open` / `$identify` lifecycle events | full | full | full | full |
| Prompt/survey/in-app modal FIFO | full | full | full | full |
| Request-scoped identify auth + conflict-only identity rotation | full | full | full | full |
| Reset invalidates active SDK UI + pending survey delivery | full | full | full | full |
| Tracked JSON actions from push + in-app buttons | full | full | full | full |
| TLS pinning (`api.usergist.com`, SPKI) | missing | partial | partial | partial |

## Implementation notes

- **Dynamic personalization** — React Native and the web SDK support typed profile updates and online recipient resolution. Native-only iOS, Android and Flutter SDK support is not included in this release; capability gates exclude older clients from versioned personalized delivery. Personalized survey attempts retain server snapshots; offline reopening after a process restart is not part of this capability. The [Movie Lab guide](../tools/demo-fixtures/README.md) describes the tested scope.

- **Native surveys** — iOS (`NativeSurveyView` / `SurveyHost`), Android (`SurveyActivity`), and Flutter (`SurveyPresenter`) render the full question contract, local branching, validation, and relaunch-safe progress. Completion ends as soon as the encrypted mutation queue accepts the answers; transient delivery failures retry in the background without trapping the user on a Retry screen, while permanent rejection or reset still fails the transition. `openSurvey` uses `GET /v1/sdk/surveys/{id}` plus the server-owned attempt endpoints, with cached armed content as the local-fire fast path.
- **Authenticated subjects and delivery** — every SDK creates or resumes an anonymous session at `/v1/sdk/session`, applies `X-UserGist-Subject-Token` to protected calls, and sends identify with a request-scoped replacement credential so concurrent calls keep the last confirmed subject. Installation identity rotates only after an explicit 401/403/409 credential conflict; transient session failures preserve anonymous identity and retry. All implementations isolate ingest batches by anonymous/external identity and poll the cursor-based instruction inbox only after local dedupe state is persisted.
- **Client-side campaigns** — only payloads explicitly marked `clientSideEligible` may fire without a server instruction. Prompt and survey segment/frequency rules use persisted identify properties and bounded event history. Matching server instructions are deduplicated by `triggerEventId`, with the latest 200 locally rendered campaign/event pairs persisted across relaunches on every SDK.
- **Modal ownership** — prompt, survey, and in-app campaign surfaces use one FIFO per SDK. A queued surface receives its lifecycle callback only when it actually reaches the screen. Reset drops queued surfaces, closes active SDK UI without inventing a user outcome, and prevents a cleared in-flight survey mutation from being reported as delivered.
- **Lifecycle consent invariant** — `$app_open` intentionally waits for feedback consent because it is also a local feedback-targeting trigger. It is persisted with the feedback purpose, so granting feedback consent is sufficient to evaluate and deliver it.
- **JSON actions** — push and in-app taps emit `$push_action_clicked` or `$inapp_cta_clicked` before dispatching the dashboard-authored object to the host callback. SDKs treat the object as data; the host app allowlists action types and owns feature, pricing, and navigation behavior.
- **Native Requests pillar — drop-in UI on every platform**. Calling `UserGist.openRequestsBoard()` opens a fully-styled board / detail / submit / comments flow without any host-side UI code:
  - **RN**: a single root `<Modal presentationStyle="fullScreen">` mounted inside `<UserGistProvider>` — internal state machine swaps board / detail / submit views (no nested modals). Branding pulled from `getRequestBranding()`.
  - **iOS**: `RequestsBoardHost.swift` presents a `UIHostingController` modally over the topmost view controller.
  - **Android**: `RequestsBoardActivity` launched via `Intent`. Mode (board / detail) is carried in extras.
  - **Flutter**: `RequestsNavHost` mounted inside `UserGistProvider` (`MaterialApp.builder`) listens on a singleton stream; `UserGist.openRequestsBoard()` pushes a `MaterialPageRoute` onto the root navigator. No `BuildContext` required at the call site.
  All four SDKs wire the eight `/v1/sdk/requests/...` endpoints + `/v1/sdk/request-branding` through their existing HTTP transport with PATCH + DELETE helpers added for comment edit/delete. The optimistic cache (`RequestsCache.{swift,kt,dart}`) mirrors the RN invariants exactly: upvote auto-creates follow; un-upvote does NOT remove the follow.
- **Search-as-you-type** uses a 300ms debounce + sequence-number guard so stale in-flight requests are dropped. Identical semantics on all four platforms.
- **Persisted-queue schema versioning**: iOS uses a wrapped JSON envelope (`{version, events}`); Android & Flutter use a `{"version":1}` header line followed by NDJSON events. All three legacy-migrate bare-array snapshots on hydrate.
- **Secure storage**: React Native accepts a host-supplied asynchronous encrypted storage adapter before `init()`; otherwise ordinary state uses AsyncStorage while subject credentials and pending mutations use bundled Keychain/EncryptedSharedPreferences bridges. iOS uses Keychain (`kSecAttrAccessibleAfterFirstUnlock`), Android `EncryptedSharedPreferences`, and Flutter `flutter_secure_storage`. Credential-bearing state never falls back to plaintext; legacy plaintext credentials are usable only after successful secure migration.
- **Transport security**: React Native currently relies on platform HTTPS trust and does not implement application-level SPKI pinning. Native SDK implementations support pinning, but production pin provisioning and rotation still require an operational runbook and live-certificate validation.

## Validation guard

`tools/check-parity.ts` runs locally with `pnpm parity`, inside the intentional
**SDK full validation (manual)** workflow, and again in every tag-driven SDK
release before the public mirror or registry is changed. It does not run on
ordinary pull requests or pushes to `main` during active development. The
script:

1. Asserts that every public method on the RN reference (`packages/sdk-react-native/src/UserGist.ts`) appears as a row in this file.
2. Requires React Native launch features to remain `full` (the explicitly optional TLS-pinning capability may be `missing`) and validates every status value.
3. Verifies critical protocol markers in all four implementations: authenticated subject and SDK metadata headers, request-scoped identify credentials, conflict-only identity rotation, reset-safe mutation delivery, durable instruction/mutation state (including relaunch-safe local/server dedupe), the four consent purposes, client-eligibility gates, persisted user history, lifecycle events, and campaign modal serialization.

The `--allow` escape hatch remains available for an intentionally staged React Native row, but production merges must not use it.

## Operational release status

- **Public registries — complete.** React Native and core are on npm, Android is
  on Maven Central, Flutter is on pub.dev, and iOS is available from the public
  SwiftPM mirror. The published artifacts have passed clean-consumer installs.
- **Provider push validation — complete.** The APNs and FCM delivery paths have
  been validated end to end on physical iOS and Android devices. High-level
  automatic enable/disable, badge, and initial-notification helpers remain
  platform-specific as shown above.
- **Customer push onboarding — per app.** Each integrating app must configure
  its own APNs/FCM credentials, identifiers, permissions, and callback plumbing,
  then validate its own signed build on physical devices. Those customer-owned
  checks do not mean the userGist provider path is unvalidated.
- **Cert-pin material — host decision.** Set production pin SHA-256 values in
  the host app's environment (`USERGIST_TLS_PIN_LEAF`,
  `USERGIST_TLS_PIN_BACKUP`) when its threat model requires pinning. Empty pins
  fall back to system trust.
