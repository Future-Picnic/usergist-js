# Expo integration (0.2 prerelease)

Expo uses the same `UserGist`, `Push`, and `UserGistProvider` as React Native.
The supported build targets are Expo 56 and 57 on iOS and Android, with the New
Architecture enabled. Use a development client or production binary. Expo Go
cannot provide the native bridge or durable secure storage. Browser targets
use `@usergist/feedback-web` separately.

## Base setup

```sh
npx expo install @usergist/feedback-react-native \
  @react-native-async-storage/async-storage react-native-safe-area-context
```

Add `"@usergist/feedback-react-native"` to `expo.plugins` in app.json or
app.config.js. Mount `UserGistProvider` once around the existing application:
in Expo Router's `app/_layout.tsx` wrap `Slot`/`Stack`; otherwise wrap App's
existing navigation. Call `initAsync` once with the public write key.

Anonymous users work without login. For identified users, obtain a scoped
subject token from your authenticated backend and call `identifyAsync`.
Never put a server API token in an `EXPO_PUBLIC_` variable. Connect `setConsent`
to the host's consent decisions, and await `reset()` before changing accounts.
The consent screen in our demo is a test harness, not a customer requirement.

## Push configuration

```js
plugins: [
  ['@usergist/feedback-react-native', {
    push: {
      mode: 'automatic',
      ios: { apsEnvironment: 'development' },
      // android: { notificationIcon: './assets/notification-icon.png',
      //            notificationColor: '#3366FF' },
    },
  }],
]
```

Set `ios.bundleIdentifier`, `android.package`, and `android.googleServicesFile`.
The Google JSON is Firebase's client configuration for that package ID, not
a service-account private key. Upload APNs/FCM sending credentials to UserGist.
Never include the .p8 or service-account key in an Expo config or application.

`apsEnvironment` must match signing: development provisioning uses
`development`; TestFlight/App Store uses `production`. This is independent of
the UserGist data environment. Runtime registration reads this plugin setting;
call `enablePush()` without an environment override to use it.

The plugin generates the notification service extension and App Group needed
for rich media and native iOS delivery receipts. Defaults are
`UserGistNotificationServiceExtension`, `<bundleId>.UserGistNotificationServiceExtension`,
and `group.<bundleId>.usergist`. Override these with `extensionTargetName`,
`extensionBundleIdentifier`, and `appGroupIdentifier` under `push.ios`.
EAS receives the extension metadata before provisioning. Verify the app and
extension profiles include the same App Group.

Omitting `push` keeps notification acquisition disabled. Initialization and
configuration never request permission. After the user opts in and consent
synchronizes, call `enablePush` from a user action. Check `result.granted` and
`result.error`; `native_module_unavailable` or `push_not_configured` describes
build configuration, not an OS denial. Restore opt-in only after checking
current OS permission. `disablePush()` disables UserGist without removing an
Expo app's shared APNs/FCM registration.

## Existing expo-notifications

Keep its existing plugin and handlers; place its plugin before UserGist's and
select `push.mode: 'expo-notifications'`. Configure the adapter before init:

```ts
import * as Notifications from 'expo-notifications'
import { configureExpoNotifications } from '@usergist/feedback-react-native/expo'
const dispose = configureExpoNotifications(Notifications)
```

Call once in the app bootstrap, not on every screen mount. Cleanup removes
the adapter listeners without modifying host notification handlers. The helper
does not request permissions, grant consent, or register a user on import.
UserGist uses native device tokens from `getDevicePushTokenAsync`, never
ExpoPushToken values. The Android dispatcher routes UserGist payloads to our
native renderer and other messages to Expo. On iOS, Expo retains foreground
presentation policy and response handling. Your existing Router/deep-link
handlers remain responsible for navigation.

## Rebuilds and conflicts

Native/plugin changes require rebuilding with `npx expo run:ios`,
`npx expo run:android`, or EAS Build. EAS Update cannot add a native module.
For manually running prebuild against existing directories, Expo 57 requires
`--no-clean` to preserve those directories; Expo 56 preserves them by default.

The plugin does not overwrite a foreign extension target or custom FCM service.
If one exists, preserve it and integrate the existing host-forwarded `Push`
API and extension base class following the React Native README. Do not enable
two FCM services. Automatic composition is supported for expo-notifications;
other SDKs require an explicit integration. Change ownership modes in a fresh
native fixture, or review the existing host configuration before migrating.

Use the Expo demo and `EXPO-ACCEPTANCE.md` for acceptance. Building or receiving
a JavaScript callback alone is not physical-device push validation.
