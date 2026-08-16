// Local user-state store used by the client-side segment evaluator.
//
// We persist:
//   - user properties (from identify() calls)
//   - event timestamp history keyed by event name (capped at 200 per event)
//
// The evaluator needs `eventCounts: name -> windowDays -> count` and
// `lastEventAt: name -> iso`. We derive both on demand from the timestamp
// history so we don't have to reindex every time a window is asked about.

import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type { UserState } from '@usergist/sdk-core'

const HISTORY_CAP_PER_EVENT = 200

export interface UserStateStore {
  readonly hydrate: () => Promise<void>
  readonly mergeProperties: (p: Readonly<Record<string, string | number | boolean | null>>) => void
  readonly recordEvent: (name: string, at?: number) => void
  readonly buildForEval: () => UserState
  readonly clear: () => Promise<void>
}

interface Persisted {
  readonly properties: Readonly<Record<string, string | number | boolean | null>>
  readonly history: Readonly<Record<string, ReadonlyArray<string>>>
}

const EMPTY: Persisted = { properties: {}, history: {} }

export function createUserStateStore(storage: StorageScope): UserStateStore {
  let state: Persisted = EMPTY
  let hydrated = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist(): void {
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      void storage.setJson(STORAGE_KEYS.userProperties, { properties: state.properties })
      void storage.setJson(STORAGE_KEYS.eventHistory, { history: state.history })
    }, 200)
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      try {
        const [props, hist] = await Promise.all([
          storage.getJson<{ properties: Persisted['properties'] }>(STORAGE_KEYS.userProperties),
          storage.getJson<{ history: Persisted['history'] }>(STORAGE_KEYS.eventHistory),
        ])
        state = {
          properties: props?.properties ?? {},
          history: hist?.history ?? {},
        }
      } catch (e) {
        reportError('userState.hydrate failed', e)
      }
      hydrated = true
    },
    mergeProperties(p): void {
      state = {
        ...state,
        properties: { ...state.properties, ...p },
      }
      schedulePersist()
    },
    recordEvent(name, at = Date.now()): void {
      const iso = new Date(at).toISOString()
      const existing = state.history[name] ?? []
      const appended = [...existing, iso]
      const trimmed =
        appended.length > HISTORY_CAP_PER_EVENT
          ? appended.slice(appended.length - HISTORY_CAP_PER_EVENT)
          : appended
      state = {
        ...state,
        history: { ...state.history, [name]: trimmed },
      }
      schedulePersist()
    },
    buildForEval(): UserState {
      // Counts: we return counts for common windows (1,3,7,14,30,60,90,180,365).
      // The evaluator reads by windowDays — a missing bucket returns 0, and
      // rules typically use canonical windows. We also compute on-demand for
      // exact matches stored in the rules, but this handles the 99% case
      // without reindexing per-track.
      const windows = [1, 3, 7, 14, 30, 60, 90, 180, 365]
      const now = Date.now()
      const counts: Record<string, Record<number, number>> = {}
      const lastAt: Record<string, string> = {}
      for (const name of Object.keys(state.history)) {
        const stamps = state.history[name] ?? []
        if (stamps.length === 0) continue
        const lastStamp = stamps[stamps.length - 1]
        if (lastStamp) lastAt[name] = lastStamp
        const bucket: Record<number, number> = {}
        for (const w of windows) {
          const cutoff = now - w * 86_400_000
          let c = 0
          // stamps are chronological; count from the tail
          for (let i = stamps.length - 1; i >= 0; i--) {
            const s = stamps[i]
            if (!s) continue
            if (Date.parse(s) >= cutoff) c += 1
            else break
          }
          bucket[w] = c
        }
        counts[name] = bucket
      }
      return {
        properties: state.properties,
        eventCounts: counts,
        lastEventAt: lastAt,
      }
    },
    async clear(): Promise<void> {
      state = EMPTY
      hydrated = true
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      await storage.clearAll([STORAGE_KEYS.userProperties, STORAGE_KEYS.eventHistory])
    },
  }
}
