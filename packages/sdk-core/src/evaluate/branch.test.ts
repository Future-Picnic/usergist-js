import { describe, expect, it } from 'vitest'
import {
  evaluateBranchCondition,
  estimateProgress,
  findQuestion,
  findQuestionIndex,
  nextQuestionId,
  reachableQuestions,
} from './branch.js'
import { SURVEY_END_SENTINEL, type SurveyFlow } from '../types/survey.js'

const flow: SurveyFlow = {
  startQuestionId: 'q1',
  progressStyle: 'bar',
  backNavigation: true,
  questions: [
    { id: 'q1', type: 'nps', title: 'How likely?' },
    { id: 'q2', type: 'short_text', title: 'Why?' },
    { id: 'q3', type: 'rating', title: 'How was it?', scale: 5 },
  ],
  branches: [
    {
      fromQuestionId: 'q1',
      condition: { op: 'lte', value: 6 },
      toQuestionId: 'q2',
    },
    {
      fromQuestionId: 'q1',
      condition: { op: 'gte', value: 9 },
      toQuestionId: SURVEY_END_SENTINEL,
    },
  ],
}

describe('evaluateBranchCondition', () => {
  it.each([
    ['eq match', { op: 'eq' as const, value: 5 }, 5, true],
    ['eq miss', { op: 'eq' as const, value: 5 }, 6, false],
    ['neq', { op: 'neq' as const, value: 5 }, 6, true],
    ['lt', { op: 'lt' as const, value: 5 }, 4, true],
    ['lte boundary', { op: 'lte' as const, value: 5 }, 5, true],
    ['gt', { op: 'gt' as const, value: 5 }, 6, true],
    ['gte boundary', { op: 'gte' as const, value: 5 }, 5, true],
    ['answered with value', { op: 'answered' as const }, 5, true],
    ['answered with empty string', { op: 'answered' as const }, '', false],
    ['answered with null', { op: 'answered' as const }, null, false],
    ['unanswered with undefined', { op: 'unanswered' as const }, undefined, true],
    ['unanswered with value', { op: 'unanswered' as const }, 'something', false],
    ['includes match', { op: 'includes' as const, value: 'a' }, ['a', 'b'], true],
    ['includes miss', { op: 'includes' as const, value: 'c' }, ['a', 'b'], false],
    ['not_includes', { op: 'not_includes' as const, value: 'c' }, ['a', 'b'], true],
  ])('%s', (_label, cond, answer, expected) => {
    expect(evaluateBranchCondition(cond, answer)).toBe(expected)
  })

  it('returns false for numeric comparisons against non-numeric answer', () => {
    expect(evaluateBranchCondition({ op: 'gt', value: 5 }, 'foo')).toBe(false)
    expect(evaluateBranchCondition({ op: 'lt', value: 5 }, 'foo')).toBe(false)
  })
})

describe('nextQuestionId', () => {
  it('routes to follow-up on detractor answer', () => {
    expect(nextQuestionId(flow, 'q1', { q1: 4 })).toBe('q2')
  })

  it('ends survey on promoter answer', () => {
    expect(nextQuestionId(flow, 'q1', { q1: 10 })).toBeNull()
  })

  it('falls through to next sequential question when no branch matches', () => {
    expect(nextQuestionId(flow, 'q1', { q1: 7 })).toBe('q2')
  })

  it('returns null after the last question', () => {
    expect(nextQuestionId(flow, 'q3', { q3: 5 })).toBeNull()
  })
})

describe('helpers', () => {
  it('finds questions by id', () => {
    expect(findQuestion(flow, 'q2')?.title).toBe('Why?')
    expect(findQuestion(flow, 'phantom')).toBeUndefined()
    expect(findQuestionIndex(flow, 'q3')).toBe(2)
    expect(findQuestionIndex(flow, 'phantom')).toBe(-1)
  })

  it('estimateProgress is monotonic', () => {
    expect(estimateProgress(flow, 'q1')).toBeLessThan(estimateProgress(flow, 'q2'))
    expect(estimateProgress(flow, null)).toBe(1)
    expect(estimateProgress(flow, 'phantom')).toBe(0)
  })

  it('reachableQuestions includes promoter end + detractor follow-up', () => {
    const reachable = reachableQuestions(flow)
    expect(reachable.has('q1')).toBe(true)
    expect(reachable.has('q2')).toBe(true) // detractor branch + sequential fallthrough
    expect(reachable.has('q3')).toBe(true) // sequential after q2
  })
})
