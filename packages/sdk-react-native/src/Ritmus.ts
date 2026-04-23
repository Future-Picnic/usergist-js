// Ritmus — public singleton facade.
//
// Philosophy:
//  - `init()` does NOT perform any I/O. It snapshots config and returns.
//    The first call that needs state triggers hydration lazily (via engine).
//  - All public methods catch their own errors and report via debug. The
//    SDK never throws across its boundary.
//  - Track is synchronous for the caller: it enqueues, schedules a flush,
//    and runs the trigger matcher — zero awaits.

import type {
  Consent,
  EventPropertyValue,
  PromptTheme,
  SdkConfig,
} from '@ritmus/sdk-core'
import {
  asEventProps,
  clearAllState,
  createEngine,
  ensureHydrated,
  enqueueAndEvaluate,
  flushNow,
  submitResponse,
  type Engine,
} from './internal/engine.js'
import { setDebugEnabled, reportError, debugLog, logTrace, getTraces } from './internal/debug.js'
import type {
  ConsentState,
  IdentityState,
  ResolvedConfig,
  ResponseEmission,
  ShowPromptPayload,
} from './internal/types.js'
import type { EventBus } from './internal/events.js'
import type { FrequencyCapManager } from './internal/frequency-cap.js'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from './ui/theme.js'

type PromptShownCb = (p: ShowPromptPayload) => void
type ResponseCb = (r: ResponseEmission) => void

let engine: Engine | null = null

function requireEngine(): Engine {
  if (!engine) {
    throw new Error('Ritmus.init must be called before using the SDK')
  }
  return engine
}

function trackInternal(
  name: string,
  props: Readonly<Record<string, EventPropertyValue>>,
): void {
  if (!engine) return
  enqueueAndEvaluate(engine, name, props)
}

export const Ritmus = {
  init(config: SdkConfig): void {
    try {
      if (engine) {
        debugLog('Ritmus.init called twice; ignoring')
        return
      }
      engine = createEngine(config)
      engine.lifecycle.start()
    } catch (e) {
      reportError('init failed', e)
    }
  },

  identify(userId: string, properties?: Record<string, EventPropertyValue>): void {
    try {
      if (typeof userId !== 'string' || userId.length === 0) {
        reportError('identify requires a userId string')
        return
      }
      const e = requireEngine()
      void (async () => {
        await ensureHydrated(e)
        await e.identity.setExternalId(userId)
        const cleanProps = asEventProps(properties)
        if (cleanProps) e.userState.mergeProperties(cleanProps)
        enqueueAndEvaluate(e, '$identify', cleanProps)
        if (!e.consent.allowsTransport()) return
        try {
          await e.transport.identify({
            anonymousId: e.identity.get().anonymousId,
            externalId: userId,
            ...(cleanProps ? { properties: cleanProps } : {}),
          })
        } catch (err) {
          reportError('transport.identify failed', err)
        }
      })()
    } catch (err) {
      reportError('identify failed', err)
    }
  },

  track(eventName: string, properties?: Record<string, EventPropertyValue>): void {
    try {
      if (typeof eventName !== 'string' || eventName.length === 0) {
        reportError('track requires a non-empty event name')
        return
      }
      const e = requireEngine()
      const props = asEventProps(properties)
      enqueueAndEvaluate(e, eventName, props)
    } catch (err) {
      reportError('track failed', err)
    }
  },

  setConsent(purposes: Consent): void {
    try {
      const e = requireEngine()
      void (async () => {
        await ensureHydrated(e)
        const next = await e.consent.set(purposes)
        const id = e.identity.get()
        if (next.analytics || next.feedback) {
          try {
            await e.transport.consent({
              anonymousId: id.anonymousId,
              externalId: id.externalId,
              purposes: { analytics: next.analytics, feedback: next.feedback },
            })
          } catch (err) {
            reportError('transport.consent failed', err)
          }
          await flushNow(e)
        }
      })()
    } catch (err) {
      reportError('setConsent failed', err)
    }
  },

  reset(): void {
    try {
      const e = requireEngine()
      void clearAllState(e).catch((err: unknown) => reportError('reset failed', err))
    } catch (err) {
      reportError('reset failed', err)
    }
  },

  setThemeOverrides(theme: PromptTheme): void {
    try {
      const e = requireEngine()
      e.themeOverride = theme ? mergeTheme(DEFAULT_THEME, theme) : null
    } catch (err) {
      reportError('setThemeOverrides failed', err)
    }
  },

  flush(): void {
    try {
      const e = requireEngine()
      void flushNow(e)
    } catch (err) {
      reportError('flush failed', err)
    }
  },

  setDebug(enabled: boolean): void {
    try {
      setDebugEnabled(enabled)
    } catch (err) {
      reportError('setDebug failed', err)
    }
  },

  getAnonymousId(): string | null {
    try {
      const id = engine?.identity.get().anonymousId
      return id && id.length > 0 ? id : null
    } catch {
      return null
    }
  },

  onPromptShown(cb: PromptShownCb): () => void {
    try {
      return requireEngine().events.on('promptShown', cb)
    } catch (err) {
      reportError('onPromptShown failed', err)
      return () => {}
    }
  },

  onResponse(cb: ResponseCb): () => void {
    try {
      return requireEngine().events.on('response', cb)
    } catch (err) {
      reportError('onResponse failed', err)
      return () => {}
    }
  },

  // ---------- Non-public / internal ----------

  // Shape is unstable; for tests and debugging only.
  __internal_state(): {
    readonly config: ResolvedConfig | null
    readonly identity: IdentityState | null
    readonly consent: ConsentState | null
    readonly queueSize: number
    readonly triggerCount: number
    readonly frequencyCaps: ReturnType<FrequencyCapManager['snapshot']> | null
    readonly traces: ReturnType<typeof getTraces>
  } {
    return {
      config: engine?.config ?? null,
      identity: engine?.identity.get() ?? null,
      consent: engine?.consent.get() ?? null,
      queueSize: engine?.queue.size() ?? 0,
      triggerCount: engine?.rules.all().length ?? 0,
      frequencyCaps: engine?.caps.snapshot() ?? null,
      traces: getTraces(),
    }
  },

  // Called by <RitmusProvider>.
  __internal_submitResponse(
    response: ResponseEmission,
    triggerEventName: string,
  ): Promise<void> {
    const e = engine
    if (!e) return Promise.resolve()
    return submitResponse(e, response, triggerEventName, trackInternal)
  },
  __internal_events(): EventBus {
    return requireEngine().events
  },
  __internal_theme(): ResolvedTheme | null {
    return engine?.themeOverride ?? null
  },
  __internal_logTrace: logTrace,
} as const

export type RitmusStatic = typeof Ritmus
