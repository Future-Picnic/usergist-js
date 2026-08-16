// Armed-surveys cache (the survey-side mirror of rules-cache).
// - Pulled on app foreground, every 5 min while foregrounded, and on-demand.
// - Persisted to AsyncStorage.
// - The survey-matcher reads from here synchronously (no I/O on track()).

import type { ArmedSurvey } from '@usergist/sdk-core'
import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError, debugLog } from './debug.js'
import type { Transport } from './transport.js'
import type { StoredSurveyRulesCache } from './types.js'

export interface SurveyRulesCache {
  readonly hydrate: () => Promise<void>
  readonly refresh: (params: {
    readonly anonymousId: string
    readonly externalId: string | null
    readonly force?: boolean
  }) => Promise<ReadonlyArray<ArmedSurvey>>
  readonly getForEvent: (eventName: string) => ReadonlyArray<ArmedSurvey>
  readonly getById: (campaignId: string) => ArmedSurvey | undefined
  readonly all: () => ReadonlyArray<ArmedSurvey>
  readonly clear: () => Promise<void>
}

export function createSurveyRulesCache(
  storage: StorageScope,
  transport: Transport,
  defaultSyncMs: number,
): SurveyRulesCache {
  let surveys: ReadonlyArray<ArmedSurvey> = []
  let byEvent: Readonly<Record<string, ReadonlyArray<ArmedSurvey>>> = {}
  let byId: Readonly<Record<string, ArmedSurvey>> = {}
  let fetchedAt = 0
  let hydrated = false
  let inflight: Promise<ReadonlyArray<ArmedSurvey>> | null = null

  function reindex(list: ReadonlyArray<ArmedSurvey>): void {
    const event: Record<string, ArmedSurvey[]> = {}
    const id: Record<string, ArmedSurvey> = {}
    for (const s of list) {
      const bucket = event[s.eventName] ?? []
      bucket.push(s)
      event[s.eventName] = bucket
      id[s.campaignId] = s
    }
    const eventOut: Record<string, ReadonlyArray<ArmedSurvey>> = {}
    for (const k of Object.keys(event)) eventOut[k] = event[k] ?? []
    byEvent = eventOut
    byId = id
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      try {
        const stored = await storage.getJson<StoredSurveyRulesCache>(
          STORAGE_KEYS.surveyRulesCache,
        )
        if (stored?.surveys) {
          surveys = stored.surveys
          reindex(surveys)
          fetchedAt = Date.parse(stored.fetchedAt)
        }
      } catch (e) {
        reportError('surveyRulesCache.hydrate failed', e)
      }
      hydrated = true
    },
    async refresh({ anonymousId, externalId, force }) {
      const now = Date.now()
      if (!force && now - fetchedAt < defaultSyncMs && surveys.length > 0) {
        return surveys
      }
      if (inflight) return inflight
      inflight = (async () => {
        try {
          const res = await transport.armedSurveys({ anonymousId, externalId })
          surveys = res.surveys
          reindex(surveys)
          fetchedAt = Date.now()
          const cache: StoredSurveyRulesCache = {
            surveys,
            fetchedAt: new Date(fetchedAt).toISOString(),
            serverTime: res.serverTime,
            nextSyncMs: res.nextSyncMs,
          }
          await storage.setJson(STORAGE_KEYS.surveyRulesCache, cache)
          debugLog('surveyRulesCache refreshed', { count: surveys.length })
          return surveys
        } catch (e) {
          reportError('surveyRulesCache.refresh failed', e)
          return surveys
        } finally {
          inflight = null
        }
      })()
      return inflight
    },
    getForEvent: (eventName): ReadonlyArray<ArmedSurvey> => byEvent[eventName] ?? [],
    getById: (campaignId): ArmedSurvey | undefined => byId[campaignId],
    all: (): ReadonlyArray<ArmedSurvey> => surveys,
    async clear(): Promise<void> {
      surveys = []
      byEvent = {}
      byId = {}
      fetchedAt = 0
      await storage.remove(STORAGE_KEYS.surveyRulesCache)
    },
  }
}
