import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  consumeInstructions,
  enqueueAndEvaluate,
  type Engine,
} from './engine.js'
import { createMutationQueue } from './mutation-queue.js'
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

function harness() {
  const data = new Map<string, unknown>([['instructionCursor', 4]])
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
    consent: {
      allowsFeedback: () => true,
      get: () => ({ feedback: true }),
    },
    localInstructionDedupe: { consume: () => false },
    transport: { acknowledgeInstructions: acknowledge },
  } as unknown as Engine
  Object.assign(engine, { mutations: createMutationQueue(engine.storage) })
  return { engine, data, emit, acknowledge }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('immediate instruction reconciliation', () => {
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
