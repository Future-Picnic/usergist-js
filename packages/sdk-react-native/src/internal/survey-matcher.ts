// Client-side survey matcher. Mirror of trigger-matcher.ts for the
// survey pillar. Runs synchronously on every `track()`.
//
// Pipeline:
//   1. Look up armed surveys for eventName.
//   2. Check survey consent.
//   3. Evaluate segment locally via sdk-core.evaluateSerializedSegmentRules.
//   4. Check local frequency cap (re-using the per-prompt manager —
//      campaign id stands in for prompt id).
//   5. Check cooldown against last shown time.
//   6. If all pass: emit `surveyInvite` (Provider opens it via the
//      already-cached survey content) + record cap + cooldown.
//
// Server reconciles asynchronously (the offer-ledger insert from the
// trigger-engine still runs for analytics correctness).

import type { ArmedSurvey, FrequencyCaps } from '@ritmus/sdk-core'
import { evaluateSerializedSegmentRules } from '@ritmus/sdk-core'
import type { SurveyRulesCache } from './survey-rules-cache.js'
import type { FrequencyCapManager } from './frequency-cap.js'
import type { UserStateStore } from './user-state.js'
import type { ConsentManager } from './consent.js'
import type { EventBus } from './events.js'
import { logTrace } from './debug.js'

export interface SurveyMatcher {
  readonly evaluate: (eventName: string) => void
}

// Translate the survey-side PushFrequencyCap shape into the prompt-
// style { perPromptDays, perUserDays } shape that frequency-cap
// understands. perCampaignDays = "this survey only", perPillarDays =
// "any survey".
function toPromptCaps(cap: ArmedSurvey['frequencyCap']): FrequencyCaps {
  return {
    perPromptDays: cap.perCampaignDays,
    perUserDays: cap.perPillarDays,
  }
}

// In-memory cooldown ledger. Survey cooldownSeconds is finer-grained
// than the day-based per-prompt cap, so we track lastShown locally.
// Resets on app restart — that's fine; the server-side cooldown is
// still authoritative on submit.
const cooldownByCampaign = new Map<string, number>()

function passesCooldown(
  campaignId: string,
  cooldownSeconds: number | null,
): boolean {
  if (!cooldownSeconds || cooldownSeconds <= 0) return true
  const last = cooldownByCampaign.get(campaignId)
  if (!last) return true
  return Date.now() - last >= cooldownSeconds * 1000
}

export function createSurveyMatcher(params: {
  readonly rulesCache: SurveyRulesCache
  readonly frequencyCaps: FrequencyCapManager
  readonly userState: UserStateStore
  readonly consent: ConsentManager
  readonly events: EventBus
}): SurveyMatcher {
  const { rulesCache, frequencyCaps, userState, consent, events } = params

  function tryFire(armed: ArmedSurvey, eventName: string): boolean {
    if (!consent.allowsSurvey()) {
      logTrace({
        eventName,
        promptId: armed.campaignId,
        outcome: 'blocked-by-consent',
        at: new Date().toISOString(),
      })
      return false
    }
    const user = userState.buildForEval()
    if (!evaluateSerializedSegmentRules(armed.segmentRules ?? null, user)) {
      logTrace({
        eventName,
        promptId: armed.campaignId,
        outcome: 'blocked-by-segment',
        at: new Date().toISOString(),
      })
      return false
    }
    const cap = frequencyCaps.canShow(
      `survey:${armed.campaignId}`,
      toPromptCaps(armed.frequencyCap),
    )
    if (!cap.ok) {
      logTrace({
        eventName,
        promptId: armed.campaignId,
        outcome: 'blocked-by-cap',
        reason: cap.reason,
        at: new Date().toISOString(),
      })
      return false
    }
    if (!passesCooldown(armed.campaignId, armed.cooldownSeconds)) {
      logTrace({
        eventName,
        promptId: armed.campaignId,
        outcome: 'blocked-by-cap',
        reason: 'per-prompt',
        at: new Date().toISOString(),
      })
      return false
    }
    // Fire — emit `surveyInvite` so the existing Provider invite
    // pipeline opens it. The Provider's openSurvey first hits the
    // cache (via __internal_armedSurveyById) so there's no follow-up
    // server fetch for survey content.
    frequencyCaps.recordShown(`survey:${armed.campaignId}`)
    cooldownByCampaign.set(armed.campaignId, Date.now())
    events.emit('surveyInvite', {
      surveyId: armed.campaignId,
      name: armed.survey.name,
      source: 'triggered',
    })
    logTrace({
      eventName,
      promptId: armed.campaignId,
      outcome: 'fired',
      at: new Date().toISOString(),
    })
    return true
  }

  return {
    evaluate(eventName) {
      const candidates = rulesCache.getForEvent(eventName)
      if (candidates.length === 0) return
      // Fire the first matching survey (one survey at a time, like
      // feedback's one-prompt-at-a-time rule).
      for (const armed of candidates) {
        if (tryFire(armed, eventName)) return
      }
    },
  }
}
