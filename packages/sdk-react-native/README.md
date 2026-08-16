# @usergist/feedback-react-native

userGist feedback SDK for React Native. Full production v1 per DEV_PRD §6.

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
  writeKey: 'wk_live_xxx',
  apiUrl: 'https://api.usergist.studio',
  environment: 'production',
  debug: __DEV__,
})

UserGist.setConsent({ analytics: true, feedback: true })

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
| `UserGist.init(config)` | Lazy — no I/O in the constructor. |
| `UserGist.identify(userId, props?)` | Persists external id + merges user properties for local segmentation. |
| `UserGist.track(name, props?)` | Enqueues event, persists, evaluates triggers synchronously. |
| `UserGist.setConsent({ analytics?, feedback? })` | Unblocks transport when any purpose flips to `true`; flushes the queue. |
| `UserGist.reset()` | Cancels in-flight, clears queue, rotates anonymous id, wipes caches. |
| `UserGist.setThemeOverrides(theme)` | Global theme applied under per-prompt theme. |
| `UserGist.flush()` | Best-effort flush. |
| `UserGist.setDebug(boolean)` | Toggle the debug trace logger at runtime. |
| `UserGist.getAnonymousId()` | Returns the persisted anonymous id (21-char, URL-safe). |
| `UserGist.onPromptShown(cb)` / `UserGist.onResponse(cb)` | Observe prompt lifecycle. |

## Architecture

See DEV_PRD §6. The SDK is a singleton that orchestrates:
`Storage · Identity · Consent · Queue · Transport · RulesCache · TriggerMatcher · FrequencyCap · Lifecycle · Debug`.

Every public method is `try/catch`-wrapped — the SDK never throws across its boundary.

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
   import UserGistFeedback

   class NotificationService: UserGistNotificationService { }
   ```
3. **Configure the NSE target's Info.plist** (or write to the App Group's
   `UserDefaults` from the main app — preferred, supports rotation):
   - `UserGistWriteKey` — required; same write key the main SDK uses.
   - `UserGistApiUrl` — optional; defaults to `https://api.usergist.studio`.
   - `UserGistAppGroup` — optional; App Group id shared with main app.
   - `UserGistAnonymousId` — populated by main SDK at init via App Group.
4. **Add `pod 'UserGistFeedback/Extension'`** to the NSE target stanza in your
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
notifications without a channel are silently dropped by the OS. Call
`UserGist.push.registerDefaultChannels(context)` at app start to create
the SDK's `transactional` / `marketing` / `silent` channel set, or
`UserGist.push.registerChannels(context, channels)` with your own list.

Server-driven channels: the dashboard's per-app channel registry is
fetched by the SDK on init and used to keep on-device channels in sync.

## Forward `applicationDidBecomeActive` / `onResume`

Call `UserGist.push.appDidBecomeActive()` from your foreground hook so the
server's reachability worker knows this device is alive — skips the next
silent-ping cycle for this user (saves provider quota + battery).

## Notes / deferred items

- **gzip**: RN does not ship zlib. Bodies are plain JSON for v0; gzip will move to a tiny native module.
- **sessionId**: not auto-generated yet; callers may pass their own in `properties` (not in the typed public surface — use a follow-up version if required).
- **Device model**: not read yet; `react-native-device-info` can be added later.
- **nanoid**: the spec calls for nanoid, but we inline a 21-char URL-safe generator to avoid the `react-native-get-random-values` polyfill requirement. The output is nanoid-compatible.

## Testing hooks

`UserGist.__internal_state()` exposes `{ config, identity, consent, queueSize, triggerCount, frequencyCaps, traces }`. Unstable; do not rely on in production code.
