import { describe, expect, it } from 'vitest'
import { surveyCompletionOutcome } from './survey-completion.js'

describe('survey completion delivery', () => {
  it('accepts a durably queued completion for background retry', () => {
    expect(
      surveyCompletionOutcome(
        'mutation-a',
        { has: () => true },
        { permanentlyRejectedIds: new Set() },
      ),
    ).toBe('deferred')
  })

  it('distinguishes delivered and permanently rejected completions', () => {
    expect(
      surveyCompletionOutcome(
        'mutation-a',
        { has: () => false },
        { permanentlyRejectedIds: new Set() },
      ),
    ).toBe('delivered')
    expect(
      surveyCompletionOutcome(
        'mutation-a',
        { has: () => false },
        { permanentlyRejectedIds: new Set(['mutation-a']) },
      ),
    ).toBe('rejected')
  })
})
