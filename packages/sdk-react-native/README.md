# @usergist/feedback-react-native

Launch-supported userGist SDK for React Native. Production use still requires the repository launch checklist: backend deployment, provider configuration, real-device push validation, and release-build verification.

## Install

```bash
pnpm add @usergist/feedback-react-native @react-native-async-storage/async-storage
```

`@react-native-async-storage/async-storage` is a peer dependency. Without it the SDK runs with an in-memory store — events won't survive relaunches.

## Quick start

```tsx
import React from 'react'
import { AppRegistry } from 'react-native'
import { UserGist, UserGistProvider } from '@usergist/feedback-react-native'

UserGist.init({
  writeKey: 'rk_live_xxx',
  apiUrl: 'https://api.usergist.studio',
  environment: 'production',
  debug: __DEV__,
})

const consentSynchronized = await UserGist.setConsent({
  analytics: true,
  feedback: true,
})

// Obtain this from your authenticated backend. It exchanges an rtk_ token at
// POST /v1/apps/:appId/sdk/subject-tokens; never ship rtk_ tokens in the app.
UserGist.identify('user_42', { plan: 'pro' }, identifiedSubjectToken)

function App() {
  return (
    <UserGistProvider>
      {/* your app */}
    </UserGistProvider>
  )
}

AppRegistry.registerComponent('app', () => App)
```

## API

| Method | Description |
|---|---|
| `UserGist.init(config)` | Returns synchronously, then hydrates and establishes the anonymous session in the background. |
| `UserGist.identify(userId, props?, subjectToken)` | Links the anonymous installation using a customer-backend-minted subject token. |
| `UserGist.track(name, props?)` | Enqueues a stable event id; the server makes targeting decisions. |
| `await UserGist.setConsent({ analytics?, feedback?, push?, survey? })` | Persists and synchronizes the transition, refreshes targeting rules, then resolves with `true`; returns `false` when synchronization fails. |
| `UserGist.reset()` | Cancels in-flight, clears queue, rotates anonymous id, wipes caches. |
| `UserGist.setThemeOverrides(theme)` | Global theme applied under per-prompt theme. |
| `UserGist.flush()` | Best-effort flush. |
| `UserGist.setDebug(boolean)` | Toggle the debug trace logger at runtime. |
| `UserGist.setDiagnosticHandler(handler)` | Receive bounded diagnostics without raw user payloads. |
| `UserGist.getAnonymousId()` | Returns the persisted anonymous id (21-char, URL-safe). |
| `UserGist.onPromptShown(cb)` / `UserGist.onResponse(cb)` | Observe prompt lifecycle. |

### Encrypted persistence

By default, the SDK uses AsyncStorage for its bounded offline queues, identity,
and signed subject session. Apps that may include PII in user IDs or queued
properties should provide an encrypted key/value adapter **before** init:

```ts
UserGist.setStorageAdapter({
  getItem: (key) => encryptedStore.getItem(key),
  setItem: (key, value) => encryptedStore.setItem(key, value),
  removeItem: (key) => encryptedStore.removeItem(key),
})
UserGist.init(config)
```

The adapter uses the same asynchronous string interface as AsyncStorage, so it
can wrap the host application's Keychain/Keystore-backed storage without the
SDK forcing another native storage dependency into every app.

## Architecture

See DEV_PRD §6. The SDK is a singleton that orchestrates:
`Storage · Subject session · Consent · Durable queues · Transport · Instruction inbox · Lifecycle · Debug`.

AsyncStorage is bounded but not encrypted. Use `setStorageAdapter` when the app
requires encryption at rest, and never put credentials or secrets in event
properties. Default email/phone/SSN/tax-id property keys are removed before
persistence and again by the API.

Public convenience methods contain their own failures and report bounded diagnostics through `setDiagnosticHandler`. Internal UI persistence hooks may reject so the bundled survey UI can show a pending/retry state instead of falsely reporting success.

## Push integration modes

`UserGist.enablePush()` uses the bundled automatic native integration by default. Apps that already own notification delegates or use another push SDK should use host-forwarded mode:

```ts
await UserGist.enablePush({
  environment: 'production',
  installDelegateProxy: false,
})

// Forward the token and message callbacks from the host integration.
await Push.registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android')
Push.handleReceived({ data })
Push.handleOpened({ data })
```

On Android, also disable the bundled `FirebaseMessagingService` when the host owns the FCM service. Set the application manifest placeholder `userGistFirebaseServiceEnabled=false` (or override/remove the library service in the app manifest). Automatic and host-forwarded modes must not both display the same notification.

On iOS, `installDelegateProxy: false` prevents UserGist from intercepting `UIApplicationDelegate` and `UNUserNotificationCenter.delegate`. The host remains responsible for forwarding the APNs token and notification callbacks through `Push`.

## iOS Notification Service Extension (NSE) — required for true delivery tracking

The NSE runs in-process when each push arrives, BEFORE the system displays it.
Without it, on iOS we cannot distinguish "delivered" from "user opened the
notification" — `delivered_at` only fills when the user actually taps.

### One-time Xcode setup

1. **File → New → Target → Notification Service Extension**
   - Name: `UserGistNotificationServiceExtension`
   - Bundle id: `<your-app-bundle>.UserGistNotificationServiceExtension`
2. **Replace the auto-generated `NotificationService.swift`** with:
   ```swift
   import UserNotifications
   import UserGistFeedbackExtension

   class NotificationService: UserGistNotificationService { }
   ```
3. **Configure the NSE target's Info.plist** (or write to the App Group's
   `UserDefaults` from the main app — preferred, supports rotation):
   - `UserGistWriteKey` — required; same write key the main SDK uses.
   - `UserGistApiUrl` — optional; defaults to `https://api.usergist.studio`.
   - `UserGistAppGroup` — optional; App Group id shared with main app.
   - `UserGistAnonymousId` — populated by main SDK at init via App Group.
4. **Add `pod 'UserGistFeedbackExtension'`** to the NSE target stanza in your
   `Podfile` and run `pod install`.

The `UserGistNotificationService` base class:
- Detects silent reachability pings (`usergist_silent: "1"`) and acks them
  — the system shows nothing.
- Beacons `POST /v1/sdk/push/delivered` with the `usergist.deliveryId` so
  we record true delivered_at, distinct from when the user opens.
- Falls back to an App Group ledger if the network beacon fails; the main
  app drains it on next foreground.
- Downloads any rich-media `imageUrl` and attaches it as a
  `UNNotificationAttachment`.

## Android NotificationChannels

Android 8+ requires every notification to belong to a registered channel —
notifications without a channel are silently dropped by the OS. The bundled
Android service creates a `usergist_default` fallback channel automatically.
When a push names a dashboard-configured `usergist_channel_id`, the service
uses it if the host app has already created that channel and otherwise falls
back safely. Host-forwarded integrations can call `await Push.fetchChannels()`
at startup and create/update those definitions with their notification library.

## Forward `applicationDidBecomeActive` / `onResume`

Automatic mode sends this beacon from the SDK's foreground listener. In
host-forwarded mode, call `Push.appDidBecomeActive()` from your foreground hook so the
server's reachability worker knows this device is alive — skips the next
silent-ping cycle for this user (saves provider quota + battery).

## Notes / deferred items

- **gzip**: RN does not ship zlib. Bodies are plain JSON for v0; gzip will move to a tiny native module.
- **sessionId**: not auto-generated yet; callers may pass their own in `properties` (not in the typed public surface — use a follow-up version if required).
- **Device model**: not read yet; `react-native-device-info` can be added later.
- **nanoid**: the spec calls for nanoid, but we inline a 21-char URL-safe generator to avoid the `react-native-get-random-values` polyfill requirement. The output is nanoid-compatible.

## Testing hooks

`UserGist.__internal_state()` exposes `{ config, identity, consent, queueSize, triggerCount, frequencyCaps, traces }`. Unstable; do not rely on in production code.
