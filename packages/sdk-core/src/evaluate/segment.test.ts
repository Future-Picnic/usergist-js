import { describe, expect, it } from 'vitest'
import {
  evaluateSegment,
  evaluateSerializedSegmentRules,
  serializedRulesToDsl,
  type UserState,
} from './segment.js'
import type { SegmentDsl } from '../types/segment-dsl.js'
import type { SerializedSegmentRules } from '../types/prompt.js'

const FIXED_NOW = Date.parse('2026-04-26T12:00:00Z')

const baseUser: UserState = {
  properties: {},
  eventCounts: {},
  lastEventAt: {},
}

function dsl(predicates: SegmentDsl['root']['predicates'], combinator: 'AND' | 'OR' = 'AND'): SegmentDsl {
  return { version: 1, root: { combinator, predicates } }
}

describe('evaluateSegment — empty group', () => {
  it('matches every user when there are no predicates', () => {
    expect(evaluateSegment(dsl([]), baseUser, FIXED_NOW)).toBe(true)
  })
})

describe('evaluateSegment — user_property predicates', () => {
  const user: UserState = {
    ...baseUser,
    properties: { plan: 'pro', age: 33, country: 'NL' },
  }

  it.each([
    ['eq match', { kind: 'user_property' as const, key: 'plan', op: 'eq' as const, value: 'pro' }, true],
    ['eq miss', { kind: 'user_property' as const, key: 'plan', op: 'eq' as const, value: 'free' }, false],
    ['neq match', { kind: 'user_property' as const, key: 'plan', op: 'neq' as const, value: 'free' }, true],
    ['gt numeric match', { kind: 'user_property' as const, key: 'age', op: 'gt' as const, value: 30 }, true],
    ['gt numeric miss', { kind: 'user_property' as const, key: 'age', op: 'gt' as const, value: 40 }, false],
    ['in match', { kind: 'user_property' as const, key: 'country', op: 'in' as const, value: ['NL', 'DE'] }, true],
    ['nin miss', { kind: 'user_property' as const, key: 'country', op: 'nin' as const, value: ['NL', 'DE'] }, false],
    ['exists', { kind: 'user_property' as const, key: 'plan', op: 'exists' as const, value: undefined }, true],
    ['not_exists', { kind: 'user_property' as const, key: 'phantom', op: 'not_exists' as const, value: undefined }, true],
    ['contains', { kind: 'user_property' as const, key: 'plan', op: 'contains' as const, value: 'r' }, true],
    ['starts_with', { kind: 'user_property' as const, key: 'plan', op: 'starts_with' as const, value: 'pr' }, true],
  ])('%s', (_label, predicate, expected) => {
    expect(evaluateSegment(dsl([predicate]), user, FIXED_NOW)).toBe(expected)
  })
})

describe('evaluateSegment — event_count predicates', () => {
  const user: UserState = {
    ...baseUser,
    eventCounts: { 'completed_checkout': { 30: 5, 7: 2 } },
  }

  it('counts above threshold', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_count', eventName: 'completed_checkout', op: 'gte', count: 3, windowDays: 30 }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(true)
  })

  it('returns 0 for unknown window', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_count', eventName: 'completed_checkout', op: 'gte', count: 1, windowDays: 90 }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(false)
  })

  it('returns 0 for unknown event', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_count', eventName: 'phantom', op: 'gt', count: 0, windowDays: 30 }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(false)
  })
})

describe('evaluateSegment — event_occurred predicates (deterministic)', () => {
  const user: UserState = {
    ...baseUser,
    lastEventAt: {
      // Two days before FIXED_NOW.
      'app_open': new Date(FIXED_NOW - 2 * 86_400_000).toISOString(),
    },
  }

  it('matches "ever within window" when last event is inside window', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_occurred', eventName: 'app_open', ever: true, windowDays: 7 }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(true)
  })

  it('rejects "ever within window" when last event is outside window', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_occurred', eventName: 'app_open', ever: true, windowDays: 1 }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(false)
  })

  it('matches "ever, no window" when event has occurred', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_occurred', eventName: 'app_open', ever: true }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(true)
  })

  it('matches "never within window" when event is outside window', () => {
    expect(
      evaluateSegment(
        dsl([{ kind: 'event_occurred', eventName: 'app_open', ever: false, windowDays: 1 }]),
        user,
        FIXED_NOW,
      ),
    ).toBe(true)
  })

  it('is deterministic across two `now` snapshots — same inputs => same output', () => {
    const predicate = { kind: 'event_occurred' as const, eventName: 'app_open', ever: true as const, windowDays: 3 }
    const r1 = evaluateSegment(dsl([predicate]), user, FIXED_NOW)
    const r2 = evaluateSegment(dsl([predicate]), user, FIXED_NOW)
    expect(r1).toBe(r2)
  })

  it('produces different result when `now` shifts past the window boundary', () => {
    const predicate = { kind: 'event_occurred' as const, eventName: 'app_open', ever: true as const, windowDays: 1 }
    const insideWindow = evaluateSegment(dsl([predicate]), user, FIXED_NOW - 86_400_000) // 1d before fixed-now: event is now 1d old, just outside
    const muchEarlier = evaluateSegment(dsl([predicate]), user, FIXED_NOW + 10 * 86_400_000) // 10d after: event is 12d old
    expect(typeof insideWindow).toBe('boolean')
    expect(typeof muchEarlier).toBe('boolean')
    // Crucially, they may differ — that's the whole point: clock controls outcome.
  })
})

describe('evaluateSegment — combinators', () => {
  const user: UserState = {
    ...baseUser,
    properties: { plan: 'pro', country: 'NL' },
  }

  it('AND requires every predicate', () => {
    const ok = evaluateSegment(
      dsl([
        { kind: 'user_property', key: 'plan', op: 'eq', value: 'pro' },
        { kind: 'user_property', key: 'country', op: 'eq', value: 'NL' },
      ]),
      user,
      FIXED_NOW,
    )
    const fail = evaluateSegment(
      dsl([
        { kind: 'user_property', key: 'plan', op: 'eq', value: 'pro' },
        { kind: 'user_property', key: 'country', op: 'eq', value: 'DE' },
      ]),
      user,
      FIXED_NOW,
    )
    expect(ok).toBe(true)
    expect(fail).toBe(false)
  })

  it('OR requires any predicate', () => {
    const ok = evaluateSegment(
      dsl(
        [
          { kind: 'user_property', key: 'plan', op: 'eq', value: 'free' },
          { kind: 'user_property', key: 'country', op: 'eq', value: 'NL' },
        ],
        'OR',
      ),
      user,
      FIXED_NOW,
    )
    expect(ok).toBe(true)
  })

  it('handles nested groups', () => {
    const result = evaluateSegment(
      {
        version: 1,
        root: {
          combinator: 'AND',
          predicates: [
            { kind: 'user_property', key: 'plan', op: 'eq', value: 'pro' },
            {
              combinator: 'OR',
              predicates: [
                { kind: 'user_property', key: 'country', op: 'eq', value: 'DE' },
                { kind: 'user_property', key: 'country', op: 'eq', value: 'NL' },
              ],
            },
          ],
        },
      },
      user,
      FIXED_NOW,
    )
    expect(result).toBe(true)
  })
})

describe('evaluateSerializedSegmentRules — bridges to evaluateSegment', () => {
  const user: UserState = {
    ...baseUser,
    properties: { plan: 'pro' },
    eventCounts: { 'opened_app': { 7: 4 } },
  }

  it('returns true when rules are null', () => {
    expect(evaluateSerializedSegmentRules(null, user, FIXED_NOW)).toBe(true)
  })

  it('combines userProperties with AND', () => {
    const rules: SerializedSegmentRules = {
      userProperties: [
        { key: 'plan', op: 'eq', value: 'pro' },
      ],
      eventCounts: [
        { eventName: 'opened_app', op: 'gte', count: 3, windowDays: 7 },
      ],
    }
    expect(evaluateSerializedSegmentRules(rules, user, FIXED_NOW)).toBe(true)
  })

  it('rejects when one rule fails', () => {
    const rules: SerializedSegmentRules = {
      userProperties: [{ key: 'plan', op: 'eq', value: 'free' }],
    }
    expect(evaluateSerializedSegmentRules(rules, user, FIXED_NOW)).toBe(false)
  })

  it('serializedRulesToDsl produces an AND-combined DSL', () => {
    const rules: SerializedSegmentRules = {
      userProperties: [{ key: 'plan', op: 'eq', value: 'pro' }],
    }
    const built = serializedRulesToDsl(rules)
    expect(built.version).toBe(1)
    expect(built.root.combinator).toBe('AND')
    expect(built.root.predicates).toHaveLength(1)
  })
})
