# SDK release operations

UserGist ships the JavaScript, iOS, Android, and Flutter SDKs as one release
train. `packages/SDK_VERSION` is the canonical version and CI rejects drift in
package metadata or runtime headers.

## One-time registry activation

These control-plane and legal actions cannot be encoded as repository changes:

1. The approved SDK license is MIT. Keep the `LICENSE` file, package metadata,
   CocoaPods metadata, and Android POM declaration aligned across every SDK.
2. Reserve `@usergist/sdk-core` and `@usergist/feedback-react-native` on npm.
   The first JavaScript release is built and published from the public
   `Future-Picnic/usergist-js` mirror so its npm artifacts have public
   provenance. Bootstrap it with a one-day granular token limited to the
   `@usergist` scope, stored as `NPM_BOOTSTRAP_TOKEN` only in that public
   repository. Then configure both packages' npm trusted publishers for
   `Future-Picnic/usergist-js` and `publish.yml` with direct `npm publish`
   disabled, set publishing access to require 2FA and disallow tokens, and
   delete the bootstrap secret and token. Subsequent releases are staged by
   CI and must be reviewed and approved by a maintainer using 2FA.
3. Publish `usergist_feedback` once from an authenticated workstation, create
   or join the verified `usergist.com` publisher, then configure pub.dev
   automated publishing for `sdk-release-flutter.yml` and the tag pattern
   `sdk-flutter-v{{version}}`.
4. Verify the `studio.usergist` namespace in Maven Central, generate a Central
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

## Release train

1. Update every SDK's `CHANGELOG.md` with customer-visible changes.
2. Run `pnpm sdk:set-version X.Y.Z`, then `pnpm install --lockfile-only`.
3. Run the complete SDK quality workflow locally where toolchains are
   available, open a pull request, and wait for `SDK quality gates` to pass.
4. Merge the exact reviewed commit to `main`.
5. Create annotated tags on that same commit:

   ```sh
   git tag -a sdk-js-vX.Y.Z -m "JavaScript SDK X.Y.Z"
   git tag -a sdk-ios-vX.Y.Z -m "iOS SDK X.Y.Z"
   git tag -a sdk-android-vX.Y.Z -m "Android SDK X.Y.Z"
   git tag -a sdk-flutter-vX.Y.Z -m "Flutter SDK X.Y.Z"
   git push origin sdk-js-vX.Y.Z sdk-ios-vX.Y.Z sdk-android-vX.Y.Z sdk-flutter-vX.Y.Z
   ```
6. For JavaScript releases, open npm's **Staged Packages** view after
   `publish.yml` succeeds. Verify both package names, versions, source commit,
   and provenance, then approve `@usergist/sdk-core` first and
   `@usergist/feedback-react-native` second using the maintainer security key.
   Reject either staged package if any release detail differs.

Each workflow verifies that its tag, package metadata, runtime SDK header, and
shared release-train version match before publishing. The JavaScript workflow
mirrors the exact reviewed source and `vX.Y.Z` tag first; the public mirror's
`publish.yml` workflow builds and stages both npm packages through trusted
publishing. A maintainer reviews the staged archives and approves the core
package first, followed by the React Native package, using 2FA. Third-party
GitHub Actions are pinned to immutable commit SHAs and Dependabot proposes
reviewed updates.

## Post-release verification

- Install both npm archives into a clean React Native consumer and build iOS
  and Android release variants.
- Resolve the public SwiftPM tag in a clean Xcode project and archive it.
- Resolve `studio.usergist:feedback:X.Y.Z` from Maven Central in a clean Gradle
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
