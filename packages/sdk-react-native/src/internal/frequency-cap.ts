// Frequency cap store — sliding windows per-prompt and per-user.
// Persisted so caps survive relaunches.
//
// Shape:
//   perPrompt: { [promptId]: ISOString }  last shown
//   lastAnyPromptAt: ISOString | null     any prompt shown (user-wide cap)

import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type { FrequencyCapState } from './types.js'
import type { FrequencyCaps } from '@ritmus/sdk-core'

const DEFAULT: FrequencyCapState = {
  perPrompt: {},
  lastAnyPromptAt: null,
}

export interface FrequencyCapManager {
  readonly hydrate: () => Promise<void>
  readonly canShow: (promptId: string, caps: FrequencyCaps) => {
    readonly ok: boolean
    readonly reason?: 'per-prompt' | 'per-user'
  }
  readonly recordShown: (promptId: string, at?: number) => void
  readonly clear: () => Promise<void>
  readonly snapshot: () => FrequencyCapState
}

export function createFrequencyCapManager(
  storage: StorageScope,
): FrequencyCapManager {
  let state: FrequencyCapState = DEFAULT
  let hydrated = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist(): void {
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      void storage.setJson(STORAGE_KEYS.frequencyCaps, state)
    }, 200)
  }

  function withinWindow(iso: string | null | undefined, days: number | undefined): boolean {
    if (!iso || days == null || days <= 0) return false
    const last = Date.parse(iso)
    if (Number.isNaN(last)) return false
    const cutoff = Date.now() - days * 86_400_000
    return last >= cutoff
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      try {
        const stored = await storage.getJson<FrequencyCapState>(STORAGE_KEYS.frequencyCaps)
        if (stored) {
          state = {
            perPrompt: stored.perPrompt ?? {},
            lastAnyPromptAt: stored.lastAnyPromptAt ?? null,
          }
        }
      } catch (e) {
        reportError('frequencyCap.hydrate failed', e)
      }
      hydrated = true
    },
    canShow(promptId, caps) {
      const perPromptDays = caps.perPromptDays
      const perUserDays = caps.perUserDays
      const lastForPrompt = state.perPrompt[promptId]
      if (withinWindow(lastForPrompt, perPromptDays)) {
        return { ok: false, reason: 'per-prompt' }
      }
      if (withinWindow(state.lastAnyPromptAt, perUserDays)) {
        return { ok: false, reason: 'per-user' }
      }
      return { ok: true }
    },
    recordShown(promptId, at = Date.now()) {
      const iso = new Date(at).toISOString()
      state = {
        perPrompt: { ...state.perPrompt, [promptId]: iso },
        lastAnyPromptAt: iso,
      }
      schedulePersist()
    },
    async clear(): Promise<void> {
      state = DEFAULT
      hydrated = true
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      await storage.remove(STORAGE_KEYS.frequencyCaps)
    },
    snapshot: (): FrequencyCapState => state,
  }
}
