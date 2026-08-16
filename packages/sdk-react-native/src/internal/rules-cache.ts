// Armed-triggers cache.
// - Pulled on app foreground, every 5 min while foregrounded, and on-demand.
// - Persisted to AsyncStorage.
// - The matcher reads from here synchronously (no I/O on track()).

import type { ArmedTrigger } from '@usergist/sdk-core'
import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError, debugLog } from './debug.js'
import type { Transport } from './transport.js'
import type { StoredRulesCache } from './types.js'

export interface RulesCache {
  readonly hydrate: () => Promise<void>
  readonly refresh: (params: {
    readonly anonymousId: string
    readonly externalId: string | null
    readonly force?: boolean
  }) => Promise<ReadonlyArray<ArmedTrigger>>
  readonly getForEvent: (eventName: string) => ReadonlyArray<ArmedTrigger>
  readonly all: () => ReadonlyArray<ArmedTrigger>
  readonly clear: () => Promise<void>
}

export function createRulesCache(
  storage: StorageScope,
  transport: Transport,
  defaultSyncMs: number,
): RulesCache {
  let triggers: ReadonlyArray<ArmedTrigger> = []
  let byEvent: Readonly<Record<string, ReadonlyArray<ArmedTrigger>>> = {}
  let fetchedAt = 0
  let hydrated = false
  let inflight: Promise<ReadonlyArray<ArmedTrigger>> | null = null

  function indexByEvent(list: ReadonlyArray<ArmedTrigger>): Readonly<Record<string, ReadonlyArray<ArmedTrigger>>> {
    const map: Record<string, ArmedTrigger[]> = {}
    for (const t of list) {
      const bucket = map[t.eventName] ?? []
      bucket.push(t)
      map[t.eventName] = bucket
    }
    // freeze arrays
    const out: Record<string, ReadonlyArray<ArmedTrigger>> = {}
    for (const k of Object.keys(map)) out[k] = map[k] ?? []
    return out
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      try {
        const stored = await storage.getJson<StoredRulesCache>(STORAGE_KEYS.rulesCache)
        if (stored?.triggers) {
          triggers = stored.triggers
          byEvent = indexByEvent(triggers)
          fetchedAt = Date.parse(stored.fetchedAt)
        }
      } catch (e) {
        reportError('rulesCache.hydrate failed', e)
      }
      hydrated = true
    },
    async refresh({ anonymousId, externalId, force }) {
      const now = Date.now()
      if (!force && now - fetchedAt < defaultSyncMs && triggers.length > 0) {
        return triggers
      }
      if (inflight) return inflight
      inflight = (async () => {
        try {
          const res = await transport.armedTriggers({ anonymousId, externalId })
          triggers = res.triggers
          byEvent = indexByEvent(triggers)
          fetchedAt = Date.now()
          const cache: StoredRulesCache = {
            triggers,
            fetchedAt: new Date(fetchedAt).toISOString(),
            serverTime: res.serverTime,
            nextSyncMs: res.nextSyncMs,
          }
          await storage.setJson(STORAGE_KEYS.rulesCache, cache)
          debugLog('rulesCache refreshed', { count: triggers.length })
          return triggers
        } catch (e) {
          reportError('rulesCache.refresh failed', e)
          return triggers
        } finally {
          inflight = null
        }
      })()
      return inflight
    },
    getForEvent: (eventName): ReadonlyArray<ArmedTrigger> => byEvent[eventName] ?? [],
    all: (): ReadonlyArray<ArmedTrigger> => triggers,
    async clear(): Promise<void> {
      triggers = []
      byEvent = {}
      fetchedAt = 0
      await storage.remove(STORAGE_KEYS.rulesCache)
    },
  }
}
