import { describe, expect, it, vi } from 'vitest'
import type { ArmedTrigger } from '@usergist/sdk-core/mobile'
import { createEventBus } from './events.js'
import { createTriggerMatcher } from './trigger-matcher.js'

function armed(clientSideEligible: boolean): ArmedTrigger {
  return {
    promptId: 'prompt-1',
    eventName: 'feedback.requested',
    clientSideEligible,
    segmentRules: null,
    frequency: {},
    prompt: {
      id: 'prompt-1',
      questions: [{
        id: 'rating-1',
        type: 'rating',
        title: 'How was it?',
        scale: 5,
      }],
    },
  }
}

function matcherFor(trigger: ArmedTrigger) {
  const events = createEventBus()
  const recordShown = vi.fn()
  return {
    events,
    recordShown,
    matcher: createTriggerMatcher({
      rulesCache: {
        getForEvent: () => [trigger],
      } as never,
      frequencyCaps: {
        canShow: () => ({ ok: true }),
        recordShown,
      } as never,
      userState: {
        buildForEval: () => ({ properties: {}, eventCounts: {} }),
      } as never,
      consent: {
        allowsFeedback: () => true,
      } as never,
      events,
    }),
  }
}

describe('trigger matcher delivery mode', () => {
  it('returns the prompt id when it renders an eligible prompt locally', () => {
    const { events, matcher, recordShown } = matcherFor(armed(true))
    const shown = vi.fn()
    events.on('showPrompt', shown)

    expect(matcher.evaluate('feedback.requested')).toBe('prompt-1')
    expect(shown).toHaveBeenCalledOnce()
    expect(recordShown).not.toHaveBeenCalled()
    expect(matcher.evaluate('feedback.requested')).toBeNull()
    matcher.recordShown('prompt-1', 123)
    expect(recordShown).toHaveBeenCalledWith('prompt-1', 123)
  })

  it('defers server-authoritative prompts without rendering locally', () => {
    const { events, matcher } = matcherFor(armed(false))
    const shown = vi.fn()
    events.on('showPrompt', shown)

    expect(matcher.evaluate('feedback.requested')).toBeNull()
    expect(shown).not.toHaveBeenCalled()
  })
})
