# Changelog

All notable changes to `@usergist/feedback-react-native` are documented here.
Releases use [Semantic Versioning](https://semver.org/).

## Unreleased

- Remove an unused codegen declaration that referenced unpublished sources and caused native build setup to fail. The shipped iOS and Android bridges remain autolinked without an app-local workaround.
- Verify native bridge files and React Native codegen discovery against the packed npm archive before release.

## 0.1.0

- Initial production React Native SDK.
- Anonymous and identified-user sessions with consent-aware ingestion.
- Offline event and mutation queues with bounded retries.
- Feedback, survey, in-app message, feature-request, and push surfaces.
- iOS and Android native push bridges plus notification-service extension.
