// Client-side trigger matcher. Runs synchronously on every `track()`.
//
// Pipeline:
//   1. Look up armed triggers for eventName.
//   2. Evaluate segment locally via sdk-core.evaluateSerializedSegmentRules.
//   3. Check local frequency caps.
//   4. Check consent for feedback.
//   5. If all pass: emit showPrompt + record frequency cap.
//
// Server reconciles asynchronously via ingest — if the client fires the wrong
// prompt, the server flags it but we don't roll back.

import type { ArmedTrigger } from '@usergist/sdk-core/mobile'
import { evaluateSerializedSegmentRules } from '@usergist/sdk-core/mobile'
import type { RulesCache } from './rules-cache.js'
import type { FrequencyCapManager } from './frequency-cap.js'
import type { UserStateStore } from './user-state.js'
import type { ConsentManager } from './consent.js'
import type { EventBus } from './events.js'
import { debugLog, logTrace } from './debug.js'

export interface TriggerMatcher {
  /** Returns the locally rendered prompt id, or null when the server decides. */
  readonly evaluate: (eventName: string) => string | null
  /** Commits a reserved cap only after the UI presenter confirms rendering. */
  readonly recordShown: (promptId: string, at?: number) => void
  /** Releases process-local reservations during reset. */
  readonly resetPending: () => void
}

export function createTriggerMatcher(params: {
  readonly rulesCache: RulesCache
  readonly frequencyCaps: FrequencyCapManager
  readonly userState: UserStateStore
  readonly consent: ConsentManager
  readonly events: EventBus
}): TriggerMatcher {
  const { rulesCache, frequencyCaps, userState, consent, events } = params
  const pendingPromptIds = new Set<string>()

  function tryFire(trigger: ArmedTrigger, eventName: string): boolean {
    if (trigger.clientSideEligible === false) {
      logTrace({
        eventName,
        promptId: trigger.promptId,
        outcome: 'blocked-no-trigger',
        reason: 'server-authoritative',
        at: new Date().toISOString(),
      })
      return false
    }
    // Consent
    if (!consent.allowsFeedback()) {
      logTrace({
        eventName,
        promptId: trigger.promptId,
        outcome: 'blocked-by-consent',
        at: new Date().toISOString(),
      })
      return false
    }
    // Segment
    const user = userState.buildForEval()
    if (!evaluateSerializedSegmentRules(trigger.segmentRules ?? null, user)) {
      logTrace({
        eventName,
        promptId: trigger.promptId,
        outcome: 'blocked-by-segment',
        at: new Date().toISOString(),
      })
      return false
    }
    // Frequency cap
    if (pendingPromptIds.has(trigger.promptId)) {
      return false
    }
    const cap = frequencyCaps.canShow(trigger.promptId, trigger.frequency)
    if (!cap.ok) {
      logTrace({
        eventName,
        promptId: trigger.promptId,
        outcome: 'blocked-by-cap',
        reason: cap.reason,
        at: new Date().toISOString(),
      })
      return false
    }
    // Fire
    pendingPromptIds.add(trigger.promptId)
    const shownAt = Date.now()
    debugLog('[usergist:analyze] prompt-show', {
      promptId: trigger.promptId,
      questionsCount: trigger.prompt.questions.length,
      triggerEventName: eventName,
    })
    events.emit('showPrompt', {
      promptId: trigger.promptId,
      prompt: trigger.prompt,
      theme: trigger.prompt.theme,
      shownAt,
      triggerEventName: eventName,
    })
    logTrace({
      eventName,
      promptId: trigger.promptId,
      outcome: 'fired',
      at: new Date(shownAt).toISOString(),
    })
    return true
  }

  return {
    evaluate(eventName) {
      const candidates = rulesCache.getForEvent(eventName)
      if (candidates.length === 0) {
        logTrace({
          eventName,
          outcome: 'blocked-no-trigger',
          at: new Date().toISOString(),
        })
        return null
      }
      // Fire the first matching trigger. Spec says one prompt at a time.
      for (const t of candidates) {
        if (tryFire(t, eventName)) return t.promptId
      }
      return null
    },
    recordShown(promptId, at) {
      pendingPromptIds.delete(promptId)
      frequencyCaps.recordShown(promptId, at)
    },
    resetPending() {
      pendingPromptIds.clear()
    },
  }
}
