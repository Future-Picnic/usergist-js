// Armed in-app messages cache. Pulled at boot + on foreground +
// every triggerSyncIntervalMs. Mirrors `rules-cache.ts` (feedback).

import type { ArmedInAppMessage } from '@ritmus/sdk-core'
import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError, debugLog } from './debug.js'
import type { Transport } from './transport.js'

interface StoredInAppCache {
  readonly messages: ReadonlyArray<ArmedInAppMessage>
  readonly fetchedAt: string
  readonly serverTime: string
  readonly nextSyncMs: number
}

export interface InAppRulesCache {
  readonly hydrate: () => Promise<void>
  readonly refresh: (params: {
    readonly anonymousId: string
    readonly externalId: string | null
    readonly force?: boolean
  }) => Promise<ReadonlyArray<ArmedInAppMessage>>
  readonly getForEvent: (eventName: string) => ReadonlyArray<ArmedInAppMessage>
  readonly all: () => ReadonlyArray<ArmedInAppMessage>
  readonly clear: () => Promise<void>
}

export function createInAppRulesCache(
  storage: StorageScope,
  transport: Transport,
  defaultSyncMs: number,
): InAppRulesCache {
  let messages: ReadonlyArray<ArmedInAppMessage> = []
  let byEvent: Readonly<Record<string, ReadonlyArray<ArmedInAppMessage>>> = {}
  let fetchedAt = 0
  let hydrated = false
  let inflight: Promise<ReadonlyArray<ArmedInAppMessage>> | null = null

  function indexByEvent(
    list: ReadonlyArray<ArmedInAppMessage>,
  ): Readonly<Record<string, ReadonlyArray<ArmedInAppMessage>>> {
    const map: Record<string, ArmedInAppMessage[]> = {}
    for (const m of list) {
      if (!m.eventName) continue
      const bucket = map[m.eventName] ?? []
      bucket.push(m)
      map[m.eventName] = bucket
    }
    const out: Record<string, ReadonlyArray<ArmedInAppMessage>> = {}
    for (const k of Object.keys(map)) out[k] = map[k] ?? []
    return out
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      try {
        const stored = await storage.getJson<StoredInAppCache>(
          STORAGE_KEYS.inAppRulesCache,
        )
        if (stored?.messages) {
          messages = stored.messages
          byEvent = indexByEvent(messages)
          fetchedAt = Date.parse(stored.fetchedAt)
        }
      } catch (e) {
        reportError('inAppRulesCache.hydrate failed', e)
      }
      hydrated = true
    },
    async refresh({ anonymousId, externalId, force }) {
      const now = Date.now()
      if (!force && now - fetchedAt < defaultSyncMs && messages.length > 0) {
        return messages
      }
      if (inflight) return inflight
      inflight = (async () => {
        try {
          const res = await transport.armedInAppMessages({ anonymousId, externalId })
          messages = res.messages
          byEvent = indexByEvent(messages)
          fetchedAt = Date.now()
          const cache: StoredInAppCache = {
            messages,
            fetchedAt: new Date(fetchedAt).toISOString(),
            serverTime: res.serverTime,
            nextSyncMs: res.nextSyncMs,
          }
          await storage.setJson(STORAGE_KEYS.inAppRulesCache, cache)
          debugLog('inAppRulesCache refreshed', {
            count: messages.length,
            events: messages.map((m) => m.eventName),
          })
          return messages
        } catch (e) {
          reportError('inAppRulesCache.refresh failed', e)
          return messages
        } finally {
          inflight = null
        }
      })()
      return inflight
    },
    getForEvent: (eventName): ReadonlyArray<ArmedInAppMessage> =>
      byEvent[eventName] ?? [],
    all: (): ReadonlyArray<ArmedInAppMessage> => messages,
    async clear(): Promise<void> {
      messages = []
      byEvent = {}
      fetchedAt = 0
      await storage.remove(STORAGE_KEYS.inAppRulesCache)
    },
  }
}
