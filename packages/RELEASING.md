# SDK release operations

UserGist normally ships the JavaScript, iOS, Android, and Flutter SDKs as one
release train. `packages/SDK_VERSION` is the canonical train version, while an
SDK-specific `SDK_VERSION` file may record a registry-only patch that must not
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

The JS source mirror now includes `packages/sdk-web`. Build `@usergist/sdk-core` before `@usergist/feedback-web`. Web bundles the browser-safe helpers and declarations from core at build time; the published Web package has no core runtime dependency and can be released independently. Run `pnpm verify:web`, API web migration/authorization tests, `pnpm sdk:check-version`, the dashboard typecheck, and native adapter checks before release. Validate both the ESM package and the standalone browser script. The optional React entry must import the root package singleton.

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

## First Web release 0.1.0

Publish the reviewed Web source and its core build inputs to the JavaScript mirror,
then tag `web-v0.1.0`. The Web job in `publish.yml` validates the version, runs the
SDK tests, and installs the packed archive into an isolated consumer to verify
plain ESM/CommonJS, optional React, SSR, TypeScript, and the standalone script.
It retains the immutable archive and SHA256 checksum as a workflow artifact.
Only Web is published by `web-v*`; existing npm core and React Native versions
are unaffected.

npm cannot stage a brand-new package. If Web does not yet exist, the workflow
uses the one-time `NPM_BOOTSTRAP_TOKEN` described above when configured. Without
that secret it prepares the archive and explicitly reports **not published**.
A maintainer can instead download the verified archive and run an authenticated
`npm publish <archive.tgz> --access public`. Configure the Web package's trusted
publisher for `Future-Picnic/usergist-js`, workflow `publish.yml`, with staging
only and maintainer 2FA before future releases. Subsequent `web-v*` releases
use `npm stage publish --provenance`. Keep bootstrap credentials out of source.
