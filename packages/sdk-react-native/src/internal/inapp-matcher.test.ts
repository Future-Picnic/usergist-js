import { describe, expect, it, vi } from 'vitest'
import type { ArmedInAppMessage } from '@usergist/sdk-core/mobile'
import { createEventBus } from './events.js'
import { createInAppMatcher } from './inapp-matcher.js'

function armed(clientSideEligible: boolean): ArmedInAppMessage {
  return {
    messageId: 'message-1',
    eventName: 'inapp.requested',
    clientSideEligible,
    format: 'modal',
    title: 'QA message',
    body: 'Repeatable message',
    imageUrl: null,
    backgroundColor: null,
    accentColor: null,
    ctas: [],
    autoDismissSeconds: null,
    screenAllowlist: [],
    screenDenylist: [],
    forceShow: false,
  }
}

function matcherFor(message: ArmedInAppMessage) {
  const events = createEventBus()
  return {
    events,
    matcher: createInAppMatcher({
      rulesCache: {
        getForEvent: () => [message],
        all: () => [message],
      } as never,
      consent: { allowsFeedback: () => true } as never,
      events,
    }),
  }
}

describe('in-app matcher delivery lifecycle', () => {
  it('opens an eligible message on every repeated event when uncapped', () => {
    const { events, matcher } = matcherFor(armed(true))
    const shown = vi.fn()
    events.on('showInAppMessage', shown)

    expect(matcher.evaluate('inapp.requested')).toBe('message-1')
    expect(matcher.evaluate('inapp.requested')).toBe('message-1')
    expect(shown).toHaveBeenCalledTimes(2)
  })

  it('defers a server-authoritative message without opening locally', () => {
    const { events, matcher } = matcherFor(armed(false))
    const shown = vi.fn()
    events.on('showInAppMessage', shown)

    expect(matcher.evaluate('inapp.requested')).toBeNull()
    expect(shown).not.toHaveBeenCalled()
  })
})
