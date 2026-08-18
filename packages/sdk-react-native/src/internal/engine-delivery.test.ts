import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueAndEvaluate,
  ensureHydrated,
  flushMutations,
  pollSurveyOffers,
  type Engine,
} from './engine.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('engine repeat delivery', () => {
  it('evaluates feedback, survey, and in-app matchers for every tracked event', () => {
    vi.useFakeTimers()
    const matcher = vi.fn(() => 'prompt-1')
    const surveyMatcher = vi.fn(() => 'survey-1')
    const inAppMatcher = vi.fn(() => 'message-1')
    const enqueue = vi.fn()
    const engine = {
      hydrated: true,
      identity: { get: () => ({ anonymousId: 'anonymous-acceptance', externalId: null }) },
      queue: { enqueue, size: () => 0 },
      userState: { recordEvent: vi.fn() },
      matcher: { evaluate: matcher },
      surveyMatcher: { evaluate: surveyMatcher },
      inAppMatcher: { evaluate: inAppMatcher },
      config: { flushBatchSize: 100, flushIntervalMs: 60_000 },
      flushTimer: null,
      locallyHandledInstructionKeys: new Set<string>(),
      locallyHandledSurveyIds: new Set<string>(),
    } as unknown as Engine

    enqueueAndEvaluate(engine, 'qa.requested', undefined)
    enqueueAndEvaluate(engine, 'qa.requested', undefined)

    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(matcher).toHaveBeenCalledTimes(2)
    expect(surveyMatcher).toHaveBeenCalledTimes(2)
    expect(inAppMatcher).toHaveBeenCalledTimes(2)
    expect(engine.locallyHandledInstructionKeys.size).toBe(6)
    expect(engine.locallyHandledSurveyIds).toEqual(new Set(['survey-1']))
  })
})

describe('survey offer reconciliation', () => {
  it('does not reopen a server offer already rendered immediately on-device', async () => {
    const emit = vi.fn()
    const setJson = vi.fn(async () => undefined)
    const engine = {
      consent: { get: () => ({ survey: true }) },
      identity: { get: () => ({ anonymousId: 'anonymous-a', externalId: null }) },
      transport: {
        surveysAvailable: vi.fn(async () => ({
          surveys: [{ id: 'survey-1', name: 'Survey', source: 'triggered' }],
        })),
      },
      storage: {
        getJson: vi.fn(async () => []),
        setJson,
      },
      events: { emit },
      locallyHandledSurveyIds: new Set(['survey-1']),
    } as unknown as Engine

    await pollSurveyOffers(engine)

    expect(emit).not.toHaveBeenCalled()
    expect(setJson).toHaveBeenCalledWith('surveys:seen-offers', ['survey-1'])
  })
})

describe('engine hydration recovery', () => {
  it('retries after a transient subject-session failure', async () => {
    const session = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ subjectToken: 'subject-token' })
    const hydrate = vi.fn(async () => undefined)
    const engine = {
      hydrated: false,
      hydratingPromise: null,
      subjectToken: null,
      sessionPromise: null,
      identity: { hydrate, get: () => ({ anonymousId: 'anonymous-acceptance' }) },
      consent: { hydrate },
      queue: { hydrate },
      mutations: { hydrate },
      caps: { hydrate },
      userState: { hydrate },
      rules: { hydrate },
      surveyRules: { hydrate },
      inAppRules: { hydrate },
      storage: {
        getJson: vi.fn(async () => null),
        setJson: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
      transport: { session, setSubjectToken: vi.fn() },
    } as unknown as Engine

    await ensureHydrated(engine)
    expect(engine.hydrated).toBe(false)
    expect(engine.hydratingPromise).toBeNull()

    await ensureHydrated(engine)
    expect(engine.hydrated).toBe(true)
    expect(session).toHaveBeenCalledTimes(2)
  })
})

describe('durable survey abandonment', () => {
  it('delivers queued abandonment work through the shared mutation flusher', async () => {
    const surveyAbandon = vi.fn(async () => ({ ok: true as const }))
    let pending = true
    const mutation = {
      id: 'mutation-abandon',
      kind: 'survey-abandon' as const,
      purpose: 'survey' as const,
      payload: { attemptId: 'attempt-a' },
      createdAt: new Date().toISOString(),
    }
    const engine = {
      mutationFlushPromise: null,
      consent: { get: () => ({ survey: true }) },
      mutations: {
        size: () => (pending ? 1 : 0),
        peek: () => (pending ? mutation : null),
        remove: vi.fn(async () => { pending = false }),
      },
      transport: { surveyAbandon },
    } as unknown as Engine

    const result = await flushMutations(engine)

    expect(result.permanentlyRejectedIds.size).toBe(0)
    expect(surveyAbandon).toHaveBeenCalledWith('attempt-a')
    expect(engine.mutations.remove).toHaveBeenCalledWith('mutation-abandon')
  })
})
