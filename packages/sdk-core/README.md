# @usergist/sdk-core

Shared contracts and mobile-safe evaluators used by the userGist SDK family.

Most application developers should install the SDK for their platform instead:

- [React Native](https://usergist.com/docs/sdks/react-native)
- [iOS](https://usergist.com/docs/sdks/ios)
- [Android](https://usergist.com/docs/sdks/android)
- [Flutter](https://usergist.com/docs/sdks/flutter)

`@usergist/sdk-core/mobile` is a lightweight runtime dependency of the React
Native package. The root export also contains UserGist API contracts, schemas,
types, and deterministic campaign/survey evaluators for advanced integrations.

## Install

```sh
npm install @usergist/sdk-core
```

The package follows semantic versioning. Public APIs are declared through the
package `exports` map; imports from undocumented internal files are unsupported.

Documentation: <https://usergist.com/docs/sdks/core>

## License

MIT
