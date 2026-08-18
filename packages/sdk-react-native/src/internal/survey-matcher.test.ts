import { describe, expect, it, vi } from 'vitest'
import type { ArmedSurvey } from '@usergist/sdk-core/mobile'
import { createEventBus } from './events.js'
import { createSurveyMatcher } from './survey-matcher.js'

function armed(clientSideEligible: boolean): ArmedSurvey {
  return {
    campaignId: 'survey-1',
    eventName: 'survey.requested',
    clientSideEligible,
    segmentRules: null,
    cooldownSeconds: null,
    frequencyCap: {},
    survey: { id: 'survey-1', name: 'QA survey' } as ArmedSurvey['survey'],
  }
}

function matcherFor(survey: ArmedSurvey) {
  const events = createEventBus()
  return {
    events,
    matcher: createSurveyMatcher({
      rulesCache: { getForEvent: () => [survey] } as never,
      frequencyCaps: {
        canShow: () => ({ ok: true }),
        recordShown: vi.fn(),
      } as never,
      userState: { buildForEval: () => ({ properties: {}, eventCounts: {} }) } as never,
      consent: { allowsSurvey: () => true } as never,
      events,
    }),
  }
}

describe('survey matcher delivery lifecycle', () => {
  it('opens an eligible survey on every repeated event when uncapped', () => {
    const { events, matcher } = matcherFor(armed(true))
    const invited = vi.fn()
    events.on('surveyInvite', invited)

    expect(matcher.evaluate('survey.requested')).toBe('survey-1')
    expect(matcher.evaluate('survey.requested')).toBe('survey-1')
    expect(invited).toHaveBeenCalledTimes(2)
  })

  it('defers a server-authoritative survey without opening locally', () => {
    const { events, matcher } = matcherFor(armed(false))
    const invited = vi.fn()
    events.on('surveyInvite', invited)

    expect(matcher.evaluate('survey.requested')).toBeNull()
    expect(invited).not.toHaveBeenCalled()
  })
})
