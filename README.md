# UserGist JavaScript SDKs

Official JavaScript packages for adding UserGist feedback, surveys, in-app
messages, feature requests, analytics, and push engagement to applications.

| Package | Purpose |
| --- | --- |
| [`@usergist/feedback-react-native`](https://www.npmjs.com/package/@usergist/feedback-react-native) | Production React Native SDK and native iOS/Android bridges |
| [`@usergist/sdk-core`](https://www.npmjs.com/package/@usergist/sdk-core) | Shared contracts, schemas, and mobile-safe targeting utilities |

## Install

```sh
npm install @usergist/feedback-react-native \
  @react-native-async-storage/async-storage \
  react-native-safe-area-context
```

See the [React Native setup guide](https://usergist.com/docs/sdks/react-native)
for initialization, anonymous and identified users, consent, UI surfaces, and
native push configuration.

## Release integrity

This repository is the public, versioned source mirror for the JavaScript SDK
release train. Each npm release is built and staged by GitHub Actions from the
matching `vX.Y.Z` tag, then reviewed and approved by a maintainer using 2FA.
npm provenance links the published package to that public source and workflow.

Development changes are reviewed in the main UserGist product repository and
mirrored here automatically. Please use this repository's issue tracker for
SDK bugs and feature requests.

## License

MIT
