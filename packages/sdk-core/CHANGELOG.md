# Changelog

## 0.2.0 — aligned SDK release train

- Align the shared core version with the platform SDKs at 0.2.0. This release preserves the contracts and runtime APIs from 0.1.6.

## 0.1.6 — platform contracts

- Add exact user ID and anonymous ID audience conditions, push reachability and send history contracts, and survey recipient attempt details.
- Add portal support, rich roadmap content, privacy notices, and monthly usage billing contracts and schemas.
- Replace the retired trial billing constants with `FREE_MAU` and `USAGE_PER_1K_CENTS`; commercial plan IDs now use `usage`.
- Preserve the existing anonymous and identified SDK session APIs.

## 0.1.2

- Add the shared presentation readiness option and runtime gate for UI SDKs.
- Add contracts for the default welcome-message onboarding flow.

All notable changes to `@usergist/sdk-core` are documented here. Releases use
[Semantic Versioning](https://semver.org/).

## 0.1.0

- Initial public contract, schemas, and shared targeting evaluators.
- Typed administration, ingestion, campaign, survey, request, and push APIs.
- Anonymous-session and backend-minted identified-subject contracts.
- Mobile-safe export for SDK runtimes.
