# Changelog

## 0.2.0-beta.2 — identity lifecycle

- Serialize explicit token invalidation with registration, remove invalidated retry candidates, and preserve consent-based re-enable behavior.
- Confirmed identity state and asynchronous completion, with backend token renewal and retained account identity after expiration.
- Property set/unset using the active session; profile PII follows the app's server allowlist, while event filtering remains in place.
- Installation-bound credentials, anonymous ownership proof, and canonical profile adoption on identify.
- Local account reset with cancellation and independent durable logout cleanup; stale responses cannot restore the old account.
- Push subscription state reflects server acknowledgement; OS tokens survive restart and retry after consent, connectivity, or identity changes.

Requires the coordinated backend lifecycle deployment. See the [identity integration guide](https://usergist.com/docs/integrations/identity) for backend requirements and account-switching guidance.


## 0.2.0-beta.1

- Add startup presentation readiness: initialize with `presentationPaused`, then call `resumePresentation()` after the loaded screen is ready.
- Keep analytics and networking running while campaign UI is paused; `pausePresentation()` can protect later host flows without dismissing active UI.
- Invalidate queued presentation work after consent revocation, reset, or identity changes, including requests prepared asynchronously.

## 0.2.0-beta.0

- Add Expo config plugin, iOS extension/EAS setup, and an optional notification adapter.
- Preserve existing Expo notification ownership and shared provider tokens.
- Add scoped native delivery-receipt retries, Expo onboarding, demo and consumer checks.
- Keep logout and consent changes from accepting stale request responses or disabling a newer push session.
- Expo support remains prerelease until signed-device acceptance is complete.

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
