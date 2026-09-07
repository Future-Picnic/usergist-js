# Changelog

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
