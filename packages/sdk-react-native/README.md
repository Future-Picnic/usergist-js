# @ritmus/feedback-react-native

Ritmus feedback SDK for React Native. Full production v1 per DEV_PRD §6.

## Install

```bash
pnpm add @ritmus/feedback-react-native @react-native-async-storage/async-storage
```

`@react-native-async-storage/async-storage` is a peer dependency. Without it the SDK runs with an in-memory store — events won't survive relaunches.

## Quick start

```tsx
import React from 'react'
import { AppRegistry } from 'react-native'
import { Ritmus, RitmusProvider } from '@ritmus/feedback-react-native'

Ritmus.init({
  writeKey: 'wk_live_xxx',
  apiUrl: 'https://api.ritmus.studio',
  environment: 'production',
  debug: __DEV__,
})

Ritmus.setConsent({ analytics: true, feedback: true })

function App() {
  return (
    <RitmusProvider>
      {/* your app */}
    </RitmusProvider>
  )
}

AppRegistry.registerComponent('app', () => App)
```

## API

| Method | Description |
|---|---|
| `Ritmus.init(config)` | Lazy — no I/O in the constructor. |
| `Ritmus.identify(userId, props?)` | Persists external id + merges user properties for local segmentation. |
| `Ritmus.track(name, props?)` | Enqueues event, persists, evaluates triggers synchronously. |
| `Ritmus.setConsent({ analytics?, feedback? })` | Unblocks transport when any purpose flips to `true`; flushes the queue. |
| `Ritmus.reset()` | Cancels in-flight, clears queue, rotates anonymous id, wipes caches. |
| `Ritmus.setThemeOverrides(theme)` | Global theme applied under per-prompt theme. |
| `Ritmus.flush()` | Best-effort flush. |
| `Ritmus.setDebug(boolean)` | Toggle the debug trace logger at runtime. |
| `Ritmus.getAnonymousId()` | Returns the persisted anonymous id (21-char, URL-safe). |
| `Ritmus.onPromptShown(cb)` / `Ritmus.onResponse(cb)` | Observe prompt lifecycle. |

## Architecture

See DEV_PRD §6. The SDK is a singleton that orchestrates:
`Storage · Identity · Consent · Queue · Transport · RulesCache · TriggerMatcher · FrequencyCap · Lifecycle · Debug`.

Every public method is `try/catch`-wrapped — the SDK never throws across its boundary.

## Notes / deferred items

- **gzip**: RN does not ship zlib. Bodies are plain JSON for v0; gzip will move to a tiny native module.
- **sessionId**: not auto-generated yet; callers may pass their own in `properties` (not in the typed public surface — use a follow-up version if required).
- **Device model**: not read yet; `react-native-device-info` can be added later.
- **nanoid**: the spec calls for nanoid, but we inline a 21-char URL-safe generator to avoid the `react-native-get-random-values` polyfill requirement. The output is nanoid-compatible.

## Testing hooks

`Ritmus.__internal_state()` exposes `{ config, identity, consent, queueSize, triggerCount, frequencyCaps, traces }`. Unstable; do not rely on in production code.
