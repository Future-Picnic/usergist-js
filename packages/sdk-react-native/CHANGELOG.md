# Changelog

## 0.1.4 — identity lifecycle

- Serialize explicit token invalidation with registration, remove invalidated retry candidates, and preserve consent-based re-enable behavior.
- Confirmed identity state and asynchronous completion, with backend token renewal and retained account identity after expiration.
- Property set/unset using the active session; profile PII follows the app's server allowlist, while event filtering remains in place.
- Installation-bound credentials, anonymous ownership proof, and canonical profile adoption on identify.
- Local account reset with cancellation and independent durable logout cleanup; stale responses cannot restore the old account.
- Push subscription state reflects server acknowledgement; OS tokens survive restart and retry after consent, connectivity, or identity changes.

Requires the coordinated backend lifecycle deployment. See the [identity integration guide](https://usergist.com/docs/integrations/identity) for backend requirements and account-switching guidance.


## 0.1.2

- Add `presentationPaused`, `pausePresentation()`, and `resumePresentation()` so analytics starts at launch while campaign UI waits for the loaded screen.
- Drop queued UI after consent withdrawal, reset, or a changed user; recheck readiness after asynchronous survey preparation.
- Preserve the stable native package setup. Expo remains on its separate prerelease channel.


All notable changes to `@usergist/feedback-react-native` are documented here.
Releases use [Semantic Versioning](https://semver.org/).

## 0.1.1

- Remove the unused codegen declaration referencing unpublished sources, fixing native build setup without app-local CocoaPods workarounds.
- Preserve the shipped iOS and Android native bridges and the existing core dependency.
- Validate native bridge files and React Native codegen discovery against the release archive.

## 0.1.0

- Initial production React Native SDK.
- Anonymous and identified-user sessions with consent-aware ingestion.
- Offline event and mutation queues with bounded retries.
- Feedback, survey, in-app message, feature-request, and push surfaces.
- iOS and Android native push bridges plus notification-service extension.
