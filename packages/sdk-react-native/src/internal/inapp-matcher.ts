// Client-side matcher for in-app messages. Same `evaluate(eventName)`
// shape as the feedback + survey matchers. The API marks only campaigns whose
// targeting and frequency rules are safe to decide locally; all others stay
// on the durable server-instruction path.

import type { ArmedInAppMessage } from '@usergist/sdk-core/mobile'
import type { InAppRulesCache } from './inapp-rules-cache.js'
import type { ConsentManager } from './consent.js'
import type { EventBus } from './events.js'
import { debugLog, logTrace } from './debug.js'

export interface InAppMatcher {
  /** Returns the locally rendered message id, or null when the server decides. */
  readonly evaluate: (eventName: string) => string | null
}

export function createInAppMatcher(params: {
  readonly rulesCache: InAppRulesCache
  readonly consent: ConsentManager
  readonly events: EventBus
}): InAppMatcher {
  const { rulesCache, consent, events } = params

  function tryFire(message: ArmedInAppMessage, eventName: string): boolean {
    if (message.clientSideEligible === false) {
      logTrace({
        eventName,
        outcome: 'blocked-no-trigger',
        reason: 'server-authoritative',
        at: new Date().toISOString(),
        promptId: message.messageId,
      })
      return false
    }
    if (!consent.allowsFeedback()) {
      logTrace({
        eventName,
        outcome: 'blocked-by-consent',
        at: new Date().toISOString(),
        promptId: message.messageId,
      })
      return false
    }
    const shownAt = Date.now()
    events.emit('showInAppMessage', {
      messageId: message.messageId,
      message,
      shownAt,
      triggerEventName: eventName,
    })
    logTrace({
      eventName,
      promptId: message.messageId,
      outcome: 'fired',
      at: new Date(shownAt).toISOString(),
    })
    return true
  }

  return {
    evaluate: (eventName: string): string | null => {
      const armed = rulesCache.getForEvent(eventName)
      if (armed.length === 0) {
        const total = rulesCache.all().length
        debugLog('inapp.evaluate', { eventName, matched: 0, totalArmed: total })
        logTrace({
          eventName,
          outcome: 'blocked-no-trigger',
          reason: `inapp-empty (totalArmed=${total})`,
          at: new Date().toISOString(),
        })
        return null
      }
      for (const msg of armed) {
        if (tryFire(msg, eventName)) return msg.messageId
      }
      return null
    },
  }
}
