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
| `onPromptShown` / `onResponse` | full | full | full | full |
| Push: `registerToken` / `invalidateToken` | full | full | full | full |
| Theme overrides | full | full | full | full |
| **Surveys** — `getAvailableSurveys()` | full | **stub** (P5.1 in flight) | full | full |
| **Surveys** — `openSurvey(surveyId)` | full | **stub** (P5.1 in flight) | full | full |
| **Surveys** — `setSurveyHandlers({...})` | full | **stub** (P5.1 in flight) | full | full |
| **Surveys** — `handleSurveyDeepLink(uri)` | full | **stub** (P5.1 in flight) | full | full |
| Save-and-resume across relaunches (surveys) | full | **stub** | full | full |
| Branching evaluator (sdk-core `nextQuestionId`) | full | **stub** | full | full |
| **Requests** — `openRequestsBoard()` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| **Requests** — `openRequestDetail(requestId)` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| **Requests** — `submitRequest(...)` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| **Requests** — `getRequests(options)` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| **Requests** — `voteOnRequest(requestId, vote)` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| **Requests** — `followRequest(requestId, follow)` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| **Requests** — `setRequestsHandlers({...})` | full | **stub** (P5.req-ios) | **stub** (P5.req-android) | **stub** (P5.req-flutter) |
| Optimistic vote/follow rollback | full | **missing** | **missing** | **missing** |
| Search-as-you-type (300ms debounce) | full | **missing** | **missing** | **missing** |

## Known gaps (tracked separately)

- **Native feature-requests UIs** (`packages/sdk-{ios,android,flutter}`) — public Swift/Kotlin/Dart API surface ships in this PR so host apps can compile against it; HTTP wiring + native UI screens (RequestsBoard, RequestDetail, SubmitRequestSheet) tracked under P5.req-{ios,android,flutter}. RN reference is `full` — iOS/Android/Flutter consumers should call into RN-bridged code or wait for native parity.
- **Native push fanout for status-change notifications** — `services/request-notify.ts` v1 publishes NATS in-app instructions only. FCM/APNs delivery via a synthetic transactional campaign is tracked as a follow-up — users in foreground get notifications immediately; users in background see them on next session.
- **iOS surveys** (`packages/sdk-ios/Sources/RitmusFeedback/Surveys/`) — full UI renderer + branching + save/resume targeted in P5.1. Until then, do not advertise iOS surveys as GA.
- **Secure storage** — consent + identity currently in plaintext `AsyncStorage` / `UserDefaults` / `SharedPreferences` / `shared_preferences`. Migration to `react-native-encrypted-storage` / Keychain / `EncryptedSharedPreferences` / `flutter_secure_storage` tracked in P5.2.
- **TLS pinning** — none of the SDKs pin `api.ritmus.studio`. Tracked in P5.4.
- **Persisted-queue schema versioning** — RN already wraps as `{version,events}`; iOS / Android / Flutter still write bare arrays. Bumping the schema in those SDKs requires versioning first.

## CI guard (planned)

Add `tools/check-parity.ts` to assert every public symbol in `packages/sdk-core/src/index.ts` has a corresponding row in this file. Lands with the iOS surveys work.
