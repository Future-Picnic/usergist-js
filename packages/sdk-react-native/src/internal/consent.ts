// Consent gate: persists the user's consent for analytics/feedback and
// exposes a gate for transport. Queue persistence is NOT gated — only
// flushing. This lets us capture events before the user decides, and then
// either flush (if granted later) or drop (if reset is called).

import type { Consent } from '@ritmus/sdk-core'
import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type { ConsentState } from './types.js'

const DEFAULT: ConsentState = {
  analytics: false,
  feedback: false,
  push: false,
  updatedAt: null,
}

export interface ConsentManager {
  readonly get: () => ConsentState
  readonly hydrate: () => Promise<ConsentState>
  readonly set: (purposes: Consent) => Promise<ConsentState>
  readonly clear: () => Promise<ConsentState>
  readonly allowsTransport: () => boolean
  readonly allowsFeedback: () => boolean
  readonly allowsPush: () => boolean
  readonly subscribe: (cb: (s: ConsentState) => void) => () => void
}

export function createConsentManager(storage: StorageScope): ConsentManager {
  let state: ConsentState = DEFAULT
  let hydrated = false
  let hydrating: Promise<ConsentState> | null = null
  const listeners = new Set<(s: ConsentState) => void>()

  function emit(): void {
    for (const l of listeners) {
      try {
        l(state)
      } catch (e) {
        reportError('consent listener failed', e)
      }
    }
  }

  async function persist(next: ConsentState): Promise<void> {
    await storage.setJson(STORAGE_KEYS.consent, next)
  }

  async function hydrate(): Promise<ConsentState> {
    if (hydrated) return state
    if (hydrating) return hydrating
    hydrating = (async () => {
      try {
        const stored = await storage.getJson<ConsentState>(STORAGE_KEYS.consent)
        if (stored) {
          state = {
            analytics: Boolean(stored.analytics),
            feedback: Boolean(stored.feedback),
            push: Boolean(stored.push),
            updatedAt: stored.updatedAt ?? null,
          }
        }
      } catch (e) {
        reportError('consent.hydrate failed', e)
      }
      hydrated = true
      return state
    })()
    return hydrating
  }

  return {
    get: (): ConsentState => state,
    hydrate,
    async set(purposes: Consent): Promise<ConsentState> {
      await hydrate()
      const next: ConsentState = {
        analytics: purposes.analytics ?? state.analytics,
        feedback: purposes.feedback ?? state.feedback,
        push: purposes.push ?? state.push,
        updatedAt: new Date().toISOString(),
      }
      state = next
      await persist(next)
      emit()
      return next
    },
    async clear(): Promise<ConsentState> {
      state = DEFAULT
      hydrated = true
      await persist(state)
      emit()
      return state
    },
    allowsTransport: (): boolean => state.analytics || state.feedback || state.push,
    allowsFeedback: (): boolean => state.feedback,
    allowsPush: (): boolean => state.push,
    subscribe(cb): () => void {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}
