import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  consumeInstructions,
  enqueueAndEvaluate,
  type Engine,
} from './engine.js'
import { createMutationQueue } from './mutation-queue.js'
import { createSurveyInvitations } from './survey-invitations.js'
import type { SdkDeliveryInstruction } from '@usergist/sdk-core/mobile'

function instruction(id: number): SdkDeliveryInstruction {
  return {
    id,
    type: 'prompt.show',
    emittedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    payload: {
      promptId: `prompt-${id}`,
      prompt: { id: `prompt-${id}`, questions: [] },
    },
  }
}

function harness(data = new Map<string, unknown>([['instructionCursor', 4]])) {
  const emit = vi.fn()
  const acknowledge = vi.fn(async () => ({ acknowledged: 1 }))
  const engine = {
    resetGeneration: 0,
    resetting: false,
    subjectToken: 'subject-a',
    instructionDispatchPromise: null,
    storage: {
      getJson: vi.fn(async (key: string) => data.get(key) ?? null),
      setJsonStrict: vi.fn(async (key: string, value: unknown) => {
        data.set(key, value)
      }),
    },
    events: { emit },
    identity: { get: () => ({ anonymousId: 'alias', externalId: null }) },
    consent: {
      allowsFeedback: () => true,
      allowsSurvey: () => true,
      get: () => ({ feedback: true }),
    },
    localInstructionDedupe: { consume: () => false },
    transport: { acknowledgeInstructions: acknowledge },
  } as unknown as Engine
  Object.assign(engine, {
    mutations: createMutationQueue(engine.storage),
    surveyInvitations: createSurveyInvitations(engine.storage, () => engine.identity.get()),
  })
  return { engine, data, emit, acknowledge }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('immediate instruction reconciliation', () => {
  it('persists a personalized invitation before notifying the host and survives SDK recreation', async () => {
    const { engine, emit } = harness()
    const offer = { ...instruction(9), type: 'survey.offer', payload: {
      surveyId: 'survey', name: 'Movie survey', presentationId: 'presentation',
      survey: { id: 'survey', flow: { questions: [{ title: 'How was Midnight Orbit?' }] } },
    } }
    emit.mockImplementation((name) => {
      if (name === 'surveyInvite') expect(engine.storage.setJsonStrict)
        .toHaveBeenCalledWith('surveys:invitations', expect.any(Array))
    })
    await consumeInstructions(engine, [offer], false)
    const restarted = createSurveyInvitations(engine.storage, () => engine.identity.get())
    expect(await restarted.find('survey')).toMatchObject({
      presentationId: 'presentation', survey: { flow: { questions: [{ title: 'How was Midnight Orbit?' }] } },
    })
    expect(emit).toHaveBeenCalledOnce()
    await consumeInstructions(engine, [offer], true)
    expect(emit).toHaveBeenCalledOnce()
  })

  it('retries an invitation if durable storage fails before delivery', async () => {
    const { engine, emit, data } = harness()
    const offer = { ...instruction(9), type: 'survey.offer', payload: {
      surveyId: 'survey', name: 'Movie survey', presentationId: 'presentation', survey: { id: 'survey' },
    } }
    vi.mocked(engine.storage.setJsonStrict).mockRejectedValueOnce(new Error('disk full'))
    await expect(consumeInstructions(engine, [offer], false)).rejects.toThrow('disk full')
    expect(emit).not.toHaveBeenCalled()
    expect(data.get('seenInstructions')).toBeUndefined()
    await consumeInstructions(engine, [offer], false)
    expect(emit).toHaveBeenCalledOnce()
  })

  it('does not skip older inbox work when a newer event is delivered immediately', async () => {
    const { engine, data, emit } = harness()
    await consumeInstructions(engine, [instruction(99)], false)
    expect(data.get('instructionCursor')).toBe(4)
    await consumeInstructions(
      engine,
      [instruction(8), instruction(99)],
      true
    )
    expect(emit.mock.calls.map((call) => call[1].promptId)).toEqual([
      'prompt-99',
      'prompt-8',
    ])
    expect(data.get('instructionCursor')).toBe(99)
  })

  it('shows an instruction once when the HTTP response races instruction polling', async () => {
    const { engine, emit } = harness()
    await Promise.all([
      consumeInstructions(engine, [instruction(9)], false),
      consumeInstructions(engine, [instruction(9)], true),
    ])
    expect(emit).toHaveBeenCalledOnce()
  })

  it('shows an in-app instruction once across concurrent responses and repeated SDK recreation while acknowledgements fail', async () => {
    const first = harness()
    first.acknowledge.mockRejectedValue(new Error('offline'))
    const message: SdkDeliveryInstruction = {
      ...instruction(9),
      type: 'inapp.show',
      payload: {
        presentationId: 'capped-presentation',
        triggerEventId: 'app-open-event',
        message: { messageId: 'capped-message', title: 'Welcome', format: 'modal', ctas: [] },
      },
    }
    await Promise.all([
      consumeInstructions(first.engine, [message], false),
      consumeInstructions(first.engine, [message], true),
      consumeInstructions(first.engine, [message, message], true),
    ])
    await first.engine.mutationFlushPromise
    expect(first.emit).toHaveBeenCalledOnce()
    expect(first.emit).toHaveBeenCalledWith('showInAppMessage', expect.objectContaining({ messageId: 'capped-message' }))
    expect(first.data.get('seenInstructions')).toEqual([9])
    expect(first.engine.mutations.size()).toBeGreaterThan(0)

    // Recreate all in-memory engine state, retaining only persisted storage.
    for (let index = 0; index < 10; index++) {
      const restarted = harness(first.data)
      restarted.acknowledge.mockRejectedValue(new Error('still offline'))
      await restarted.engine.mutations.hydrate()
      await consumeInstructions(restarted.engine, [message], true)
      await restarted.engine.mutationFlushPromise
      expect(restarted.emit).not.toHaveBeenCalled()
      expect(restarted.data.get('seenInstructions')).toEqual([9])
    }
  })

  it('does not show an in-app message until its delivery receipt is durable, and retries after a storage failure', async () => {
    const { engine, data, emit, acknowledge } = harness()
    const message: SdkDeliveryInstruction = {
      ...instruction(9), type: 'inapp.show',
      payload: { message: { messageId: 'capped-message', title: 'Welcome', format: 'modal' } },
    }
    vi.mocked(engine.storage.setJsonStrict).mockRejectedValueOnce(new Error('disk full'))
    await expect(consumeInstructions(engine, [message], false)).rejects.toThrow('disk full')
    expect(emit).not.toHaveBeenCalled()
    expect(acknowledge).not.toHaveBeenCalled()
    expect(data.get('seenInstructions')).toBeUndefined()

    emit.mockImplementation(() => {
      expect(data.get('seenInstructions')).toEqual([9])
    })
    await consumeInstructions(engine, [message], false)
    await engine.mutationFlushPromise
    expect(emit).toHaveBeenCalledOnce()
    await consumeInstructions(engine, [message], true)
    expect(emit).toHaveBeenCalledOnce()
  })

  it('delivers the next instruction while earlier acknowledgments are offline', async () => {
    const { engine, emit, acknowledge } = harness()
    let release!: () => void
    acknowledge.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve({ acknowledged: 1 })
    }))
    await consumeInstructions(engine, [instruction(9)], false)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await consumeInstructions(engine, [instruction(10)], false)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(engine.mutations.size()).toBe(2)
    release()
    await engine.mutationFlushPromise
    expect(engine.mutations.size()).toBe(0)
  })

  it.each(['reset', 'identify'] as const)(
    'discards an old user response after %s',
    async (change) => {
      const { engine, emit, acknowledge } = harness()
      let release!: (value: unknown) => void
      Object.assign(engine.storage, {
        getJson: vi.fn(
          () =>
            new Promise((resolve) => {
              release = resolve
            })
        ),
      })
      const pending = consumeInstructions(engine, [instruction(9)], false)
      await vi.waitFor(() => expect(release).toBeTypeOf('function'))
      if (change === 'reset') engine.resetGeneration++
      else engine.subjectToken = 'subject-b'
      release([])
      await pending
      expect(emit).not.toHaveBeenCalled()
      expect(acknowledge).not.toHaveBeenCalled()
      expect(engine.storage.setJsonStrict).not.toHaveBeenCalled()
    }
  )
})

describe('server-dependent trigger timing', () => {
  it('uploads a known server trigger without advancing the analytics flush timer', async () => {
    vi.useFakeTimers()
    const queued: any[] = []
    const ingest = vi.fn(async (_batch: unknown) => ({
      accepted: 1,
      rejected: 0,
      instructions: [],
    }))
    const engine = {
      hydrated: true,
      resetting: false,
      resetGeneration: 0,
      subjectToken: 'subject-a',
      flushPromise: null,
      flushTimer: null,
      mutationFlushPromise: null,
      config: { flushBatchSize: 100, flushIntervalMs: 15000 },
      identity: {
        get: () => ({ anonymousId: 'anonymous-a', externalId: null }),
      },
      consent: { get: () => ({ analytics: true, feedback: true }) },
      queue: {
        enqueue: (event: any) => queued.push(event),
        size: () => queued.length,
        snapshot: () => [...queued],
        remove: () => {
          queued.length = 0
        },
      },
      mutations: { size: () => 0 },
      rules: { needsServer: (name: string) => name === 'checkout' },
      surveyRules: { needsServer: () => false },
      inAppRules: { needsServer: () => false },
      matcher: { evaluate: () => null },
      surveyMatcher: { evaluate: () => null },
      inAppMatcher: { evaluate: () => null },
      userState: { recordEvent: vi.fn() },
      context: {
        sdkVersion: () => 'rn-test',
        platform: () => 'ios',
        build: (id: any) => ({
          ...id,
          platform: 'ios',
          sdkVersion: 'rn-test',
        }),
      },
      transport: { ingest },
    } as unknown as Engine
    for (let i = 0; i < 30; i++) {
      enqueueAndEvaluate(engine, 'watch-history', { order: i })
    }
    const analyticsTimer = engine.flushTimer
    enqueueAndEvaluate(engine, 'checkout', { show_id: '00123' })
    await engine.flushPromise
    expect(ingest).toHaveBeenCalledOnce()
    expect(ingest.mock.calls[0]![0]).toMatchObject({
      delivery: { eventIds: [expect.any(String)] },
      events: expect.arrayContaining([
        expect.objectContaining({
          name: 'checkout',
          properties: { show_id: '00123' },
          anonymousId: 'anonymous-a',
        }),
      ]),
    })
    expect((ingest.mock.calls[0]![0] as any).events).toHaveLength(31)
    expect(engine.flushTimer).toBe(analyticsTimer)
  })
})
