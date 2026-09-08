# Expo release evidence

Status: implementation under validation; stable release is blocked.

Record the exact npm archive SHA256, source commit, Expo/React Native versions,
build profile, and app identifiers alongside each result. Never record tokens
or provider private keys. A mocked provider or generated Firebase fixture does
not count as a live push test.

## Automated gates

- Packed archive resolves every existing export, `/expo`, the Node config
  plugin, Expo subscriber, Kotlin dispatcher, and notification extension files.
- Expo 56.0.21 and 57.0.20: automatic and expo-notifications mode, iOS and
  Android, with the New Architecture and repeated non-destructive prebuild.
- Existing React Native typecheck, unit tests, codegen/package check, and builds.
- Dashboard/API validation, Expo platform mapping, AI snippets, and onboarding.

## Signed-device gates (pending)

- Physical iPhone and Android: anonymous startup, identify, logout/account switch,
  offline relaunch and eventual synchronization; no cross-user data or token binding.
- All reference demo feedback types, surveys, in-app messages, request board,
  comments/votes/follows, targeting, branding, and analytics.
- UserGist push: foreground/background/terminated launch; token refresh, permission
  denial and later recovery, channels, badge behavior, images, actions, JSON actions,
  deep links, silent reachability and delivered/open evidence.
- Coexistence: interleave unrelated Expo and UserGist messages, including cold
  starts; one presentation and handler invocation per event/action. Disable
  UserGist and verify unrelated notifications still arrive.
- Turn off networking while a native receipt is recorded; restore it and verify
  the original delivery timestamp is acknowledged once. Logout before retry and
  verify that old work is never attributed to the new account.
- iOS development APNs signing and a distribution-signed build, including
  extension embedding, provisioning, App Group persistence and rich delivery.

## Promotion

Publish a prerelease with npm tag `next` for consumer acceptance after package
and native build gates pass. Keep stable `latest` unchanged until all signed
device gates above have evidence. Do not describe Expo support as production
validated while this document remains pending.

The public release workflow enforces this through
`tools/expo/check-release-evidence.mjs`. Supply the repository variable
`USERGIST_EXPO_RELEASE_EVIDENCE` as JSON with `version`, `archiveSha256`,
`sourceCommit`, and arrays `nativeBuilds`, `regressions`, `physicalDevices`.
Each entry has `name`, `passed: true`, and a durable HTTPS `evidenceUrl` to
the corresponding build or device report. The script lists the exact required
names. Prereleases require package, prebuild, ordinary React Native regression,
and all eight Expo native combinations; stable additionally requires signed
physical-device evidence. A missing variable blocks publication.

For stable promotion, validate the final stable archive too: changing a
prerelease version changes the package bytes and invalidates its earlier hash.
