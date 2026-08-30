# @usergist/feedback-react-native

Launch-supported userGist SDK for React Native and the behavioral reference for
the iOS, Android, and Flutter packages. Production use still requires the
repository launch checklist: backend deployment, provider configuration,
real-device push validation, and release-build verification.

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

// Obtain this from your authenticated backend. It exchanges an rtk_ token at
// POST /v1/apps/:appId/sdk/subject-tokens; never ship rtk_ tokens in the app.
const identityResult = await UserGist.initAsync(
  {
    writeKey: 'rk_live_xxx',
    apiUrl: 'https://api.usergist.studio',
    environment: 'production',
    debug: __DEV__,
  },
  {
    userId: 'user_42',
    properties: { plan: 'pro' },
    subjectToken: identifiedSubjectToken,
  },
)

const consentSynchronized = await UserGist.setConsent({
  analytics: true,
  feedback: true,
})

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
| `await UserGist.initAsync(config, initialIdentity?)` | Hydrates and optionally binds a server-proven identity before lifecycle events begin; returns `synced`, `queued`, or `rejected`. |
| `UserGist.identify(userId, props?, subjectToken)` | Links the anonymous installation using a customer-backend-minted subject token. |
| `await UserGist.identifyAsync(userId, props?, subjectToken)` | Backward-compatible async identity API returning `synced`, `queued`, or `rejected`. |
| `UserGist.track(name, props?)` | Enqueues a stable event id and immediately evaluates only server-authorized client-side campaigns; all other decisions remain server-authoritative. |
| `await UserGist.setConsent({ analytics?, feedback?, push?, survey? })` | Persists and synchronizes the transition, refreshes targeting rules, then resolves with `true`; returns `false` when synchronization fails. |
| `await UserGist.reset()` | Cancels in-flight, clears queue, rotates anonymous id, wipes caches, and resolves after the new anonymous session is ready. |
| `UserGist.setThemeOverrides(theme)` | Global theme applied under per-prompt theme. |
| `UserGist.flush()` | Best-effort flush. |
| `UserGist.setDebug(boolean)` | Toggle the debug trace logger at runtime. |
| `UserGist.setDiagnosticHandler(handler)` | Receive bounded diagnostics without raw user payloads. |
| `UserGist.getAnonymousId()` | Returns the persisted anonymous id (21-char, URL-safe). |
| `UserGist.getExternalId()` | Returns the current stable external account ID, or `null`. |
| `UserGist.onPromptShown(cb)` / `UserGist.onResponse(cb)` | Observe prompt lifecycle. |

Call and await `reset()` before identifying a different account on the same
installation. Switching directly from one non-null external ID to another is
rejected so two people cannot be merged accidentally.

### Encrypted persistence

By default, the SDK uses AsyncStorage for bounded event/campaign state and
identity. Signed subject credentials and the durable mutation queue use the
bundled Keychain/EncryptedSharedPreferences native store and never fall back to
plaintext; if that native store is unavailable they remain process-memory only.
Apps that want every persisted value encrypted can provide an encrypted
key/value adapter **before** init:

```ts
UserGist.setStorageAdapter({
  getItem: (key) => encryptedStore.getItem(key),
  setItem: (key, value) => encryptedStore.setItem(key, value),
  removeItem: (key) => encryptedStore.removeItem(key),
})
UserGist.init(config)
```

The adapter uses the same asynchronous string interface as AsyncStorage, so it
can wrap the host application's Keychain/Keystore-backed storage.

## Architecture

See DEV_PRD §6. The SDK is a singleton that orchestrates:
`Storage · Subject session · Consent · Durable queues · Transport · Instruction inbox · Armed campaigns · Persistent user state · Modal UI · Lifecycle · Debug`.

AsyncStorage is bounded but not encrypted. Use `setStorageAdapter` when all SDK
state must be encrypted at rest, and never put credentials or secrets in event
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

### JSON-driven in-app actions

Dashboard-authored in-app CTAs and push action buttons can use the `json`
action type. The SDK always records the generic button-tap event first, then
passes the structured object to the host app. Keep business logic in the app
so the same action can safely select a price, enable a feature, or route into a
native flow:

```ts
function executeAction(action: Readonly<Record<string, unknown>>) {
  if (action.type === 'enable_feature' && typeof action.feature === 'string') {
    featureStore.enable(action.feature)
  }
}

UserGist.setInAppHandlers({
  onJsonAction: (action) => executeAction(action),
})

Push.setHandlers({
  onJsonAction: (action) => executeAction(action),
})
```

JSON actions are data, not executable code. Validate supported `type` values
and fields in the host before changing app state.

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
