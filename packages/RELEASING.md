# SDK release operations

UserGist normally ships the JavaScript, iOS, Android, and Flutter SDKs as one
release train. `packages/SDK_VERSION` is the canonical train version, while an
SDK-specific `SDK_VERSION` file may record an independent patch that must not
rewrite an existing public tag. CI rejects drift in package metadata or runtime
headers.

The private monorepo is the development source of truth. The public SDK
repositories are release mirrors, not day-to-day development repositories;
release workflows replace their reviewed source only after a version tag is
created.

## One-time registry activation

These control-plane and legal actions cannot be encoded as repository changes:

1. The approved SDK license is MIT. Keep the `LICENSE` file, package metadata,
   CocoaPods metadata, and Android POM declaration aligned across every SDK.
2. Reserve `@usergist/sdk-core`, `@usergist/feedback-react-native` and `@usergist/feedback-web` on npm.
   The first JavaScript release is built and published from the public
   `Future-Picnic/usergist-js` mirror so its npm artifacts have public
   provenance. Bootstrap it with a one-day granular token limited to the
   `@usergist` scope, stored as `NPM_BOOTSTRAP_TOKEN` only in that public
   repository. Then configure all three packages' npm trusted publishers for
   `Future-Picnic/usergist-js` and `publish.yml` with direct `npm publish`
   disabled, set publishing access to require 2FA and disallow tokens, and
   delete the bootstrap secret and token. Subsequent releases are staged by
   CI and must be reviewed and approved by a maintainer using 2FA.
3. Publish `usergist_feedback` once from the public `v0.1.0` source tag on an
   authenticated workstation, create or join the verified `usergist.com`
   publisher, then configure pub.dev automated publishing for
   `Future-Picnic/usergist-flutter`, workflow `publish.yml`, tag pattern
   `v{{version}}`, and GitHub environment `pub.dev`.
4. Verify the `com.usergist` namespace in Maven Central, generate a Central
   Portal user token, and provision a dedicated OpenPGP signing subkey. Store
   `CENTRAL_TOKEN_USERNAME`, `CENTRAL_TOKEN_PASSWORD`, `GPG_PRIVATE_KEY`, and
   `GPG_PRIVATE_KEY_PASSWORD` as encrypted GitHub Actions repository secrets.
5. Create empty public source repositories named `Future-Picnic/usergist-js`,
   `Future-Picnic/usergist-ios`, `Future-Picnic/usergist-android`, and
   `Future-Picnic/usergist-flutter`. Create a dedicated GitHub App with
   **Contents: read/write** access only to those repositories, install it on
   those four repositories, set `SDK_RELEASE_APP_ID` as a repository variable,
   and store `SDK_RELEASE_APP_PRIVATE_KEY` as a repository secret.
   Release jobs mint short-lived installation tokens and publish filtered,
   metadata-sanitized, version-tagged source mirrors; private commit messages
   and author addresses are not copied, and no long-lived personal access
   token is used.
6. Configure real APNs and FCM credentials in UserGist and complete the
   physical-device matrix in `PARITY.md`. Push cannot be certified from a
   simulator or source-only CI.

The current private repository is on GitHub Free, which does not support
environment secrets or required deployment reviewers for private repositories.
Only organization administrators may create release tags while this plan is in
use. Registry credentials must never be referenced by pull-request workflows.
Before release permissions expand beyond the current maintainers, move all
release credentials into a protected environment on a plan that supports
private-repository environments and require an independent reviewer with
self-review disabled.

## Development validation

The complete cross-platform matrix is intentionally **manual** while UserGist
is under active development. Ordinary pull requests and pushes to `main` do not
start it or consume its hosted-runner budget.

- During day-to-day work, run the relevant package checks locally.
- Before a coordinated SDK release or after a shared protocol change, open
  **Actions → SDK full validation (manual) → Run workflow**, select the exact
  candidate branch, and enter the reason.
- The CLI equivalent is
  `gh workflow run sdk-ci.yml --ref <candidate-branch> -f reason="<reason>"`.
- Tag-driven release workflows independently revalidate the SDK they are about
  to publish. A failed check stops before the public mirror or registry changes.

## Release train

1. Update every SDK's `CHANGELOG.md` with customer-visible changes.
2. Run `pnpm sdk:set-version X.Y.Z`, then `pnpm install --lockfile-only`.
3. Run the affected SDK checks locally, then open and review a pull request.
4. Merge the exact reviewed commit to `main`.
5. Intentionally run **SDK full validation (manual)** on `main` and wait for all
   five jobs to pass.
6. Create annotated tags on that same commit:

   ```sh
   git tag -a sdk-js-vX.Y.Z -m "JavaScript SDK X.Y.Z"
   git tag -a sdk-ios-vX.Y.Z -m "iOS SDK X.Y.Z"
   git tag -a sdk-android-vX.Y.Z -m "Android SDK X.Y.Z"
   git tag -a sdk-flutter-vX.Y.Z -m "Flutter SDK X.Y.Z"
   git push origin sdk-js-vX.Y.Z sdk-ios-vX.Y.Z sdk-android-vX.Y.Z sdk-flutter-vX.Y.Z
   ```
7. For JavaScript releases, open npm's **Staged Packages** view after
   `publish.yml` succeeds. Verify all three package names, versions, source commit,
   and provenance, then approve `@usergist/sdk-core` first and
   `@usergist/feedback-react-native` and `@usergist/feedback-web` afterward using the maintainer security key.
   Reject any staged package if any release detail differs.

Each workflow verifies that its tag, package metadata, runtime SDK header, and
shared release-train version match before publishing. The JavaScript workflow
mirrors the exact reviewed source and `vX.Y.Z` tag first; the public mirror's
`publish.yml` workflow builds and stages all three npm packages through trusted
publishing. A maintainer reviews the staged archives and approves the core
package first, followed by the React Native and Web packages, using 2FA. Third-party
GitHub Actions are pinned to immutable commit SHAs and Dependabot proposes
reviewed updates. The Flutter workflow likewise mirrors the exact reviewed
source and `vX.Y.Z` tag; that tag triggers the public mirror's `publish.yml`
workflow, which publishes through pub.dev's short-lived OIDC authentication.
Release retries never rewrite a public tag: the mirror step verifies that an
existing tag resolves to the exact filtered commit before continuing.

## Startup presentation readiness release

Core, Web, native iOS, Android, and Flutter advance to 0.1.2. The stable React
Native 0.1.2 patch is backported onto private commit `e6f83c3`, matching published
`rn-v0.1.1`; it contains readiness controls without promoting Expo. The current
React Native/Expo development line advances to 0.2.0-beta.1 on npm `next` and
must pass its exact-archive native build evidence gate. Stable Expo still needs
signed physical-device acceptance; do not promote the beta to bypass that gate.

Validate each candidate before publishing. Use the public SDK validation bridge
in `infra/docs/public-sdk-ci.md`; the legacy private full-validation jobs are
intentionally disabled. Run the local native tests and hosted iOS startup
regression as well. Stable React Native and Expo must each validate their own
release archive.

Publish core before dependent npm packages, then the native packages and both
React Native channels. The shared JavaScript release can stage core/Web without
promoting a separately versioned React Native prerelease. Stable React Native
uses `rn-v0.1.2`; Expo uses `rn-v0.2.0-beta.1`. Never overwrite a public tag.
Npm staging still requires the maintainer's security-key approval.

Only deploy dashboard/docs requiring the readiness APIs after their referenced
packages resolve from the public registries. A DigitalOcean deployment does not
publish SDKs or update customer lockfiles. Customers must update, rebuild,
initialize with presentation paused, and resume after startup navigation. The
option defaults to false for compatibility and does not require sign-in.

## Welcome-message onboarding rollout

Apply `infra/postgres/migrations/0049_onboarding_first_inapp.sql` before running
the updated API or workers. Production API startup runs pending Postgres
migrations. Deploy the API before the dashboard: the dashboard uses the new
`create_first_inapp` and `first_inapp_completed` onboarding actions. Existing
feedback onboarding remains supported during rollout.

Build the workspace core package before the API/dashboard. These shared
onboarding contracts do not require customers to install a new client SDK.
Setup instructions require the startup-readiness SDK releases described above.

The welcome example activates for everyone on app open, with one impression per
user. Completion requires a real shown event and pauses the example before
advancing. Its delivery proof is stored on the app without personal identifiers,
so ingest-outbox retention cannot erase onboarding progress.

## Post-release verification

- Install the core and React Native npm archives into a clean React Native consumer and build iOS
  and Android release variants.
- Install the core and Web archives into a clean browser consumer; verify ESM, the optional React entry and the standalone script with exact origin configuration and explicit activation.
- Resolve the public SwiftPM tag in a clean Xcode project and archive it.
- Resolve `com.usergist:feedback:X.Y.Z` from Maven Central in a clean Gradle
  project and assemble a minified release.
- Resolve `usergist_feedback:X.Y.Z` from pub.dev in a clean Flutter project and
  build iOS and Android release variants.
- Confirm every registry's repository and issue links resolve to the matching
  public source mirror and `vX.Y.Z` tag.
- Verify initialization, anonymous ingestion, backend-minted identified-user
  binding, consent changes, offline retry, and one feedback surface on every
  platform.
- For releases touching push, repeat APNs sandbox/production and FCM delivery,
  open, action, silent-ack, permission, and token-rotation tests on physical
  devices before announcing push support for that version.

Registry releases are immutable. Fixes always use a new SemVer version; never
overwrite or force-move a published tag.

## Web SDK and delivery protocol 2

The JS source mirror now includes `packages/sdk-web`. Build `@usergist/sdk-core` before `@usergist/feedback-web`; publish core before web because web consumes its public client entry. Run `pnpm verify:web`, API web migration/authorization tests, `pnpm sdk:check-version`, the dashboard typecheck, and native adapter checks before release. Validate both the ESM package and the standalone browser script. The optional React entry must import the root package singleton.

Apply `0041_web_support.sql` before deploying the API and workers, then deploy the dashboard and release the SDKs. Existing campaigns retain their configured native platforms. Web is enabled explicitly per app and per campaign. Deploy coordinated-delivery native adapters before enabling mixed native/Web campaigns. Version 1 native inboxes cannot consume protocol 2 instructions. Legacy web-envelope compatibility is not a substitute for upgrading all workers and native adapters. Do not backfill Web into existing campaigns.

The private `@usergist/demo-web` workspace package must never be published. Its development token helper is disabled in production. Production website origins and management credentials must be configured by the app owner; the demo does not provision them automatically.

## React Native packaging patch 0.1.1

This isolated release starts from the published JavaScript 0.1.0 source. Only
React Native advances to 0.1.1; its SDK_VERSION file and runtime header record
the patch, while core remains 0.1.0. The public rn-v0.1.1 tag runs publish.yml,
validates the packed native bridge, and stages only the React Native package.
The web SDK is not included. Maintainer 2FA approval is still required on npm.
The reviewed private release branch remains the source of truth; the public
mirror receives identical SDK files and a sanitized release commit.
