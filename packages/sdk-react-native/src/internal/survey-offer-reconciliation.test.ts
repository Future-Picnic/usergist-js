import { PresentationGate } from '@usergist/sdk-core/mobile'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { consumeInstructions, pollInstructions, pollSurveyOffers, type Engine } from './engine.js'

let now = Date.UTC(2040, 0, 1)
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now += 10000) })
afterEach(() => { vi.useRealTimers() })

const offer = (id = 10) => ({
  id, type: 'survey.offer', emittedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  payload: { surveyId: 'survey-a', name: 'Survey A', source: 'triggered', triggerEventId: 'event-' + id },
})

function harness() {
  const data = new Map<string, unknown>()
  const emit = vi.fn()
  const instructions = vi.fn(async () => ({ instructions: [offer()] }))
  const available = vi.fn(async () => ({ surveys: [{ id: 'survey-a', name: 'Survey A', source: 'triggered' }] }))
  const engine = {
    config: { appVersion: '1.0.0' },
    hydrated: true, resetting: false, resetGeneration: 0, subjectToken: 'subject',
    instructionPollPromise: null, instructionDispatchPromise: null, mutationFlushPromise: null,
    presentation: new PresentationGate(),
    context: { platform: () => 'ios', sdkVersion: () => 'qa-survey' },
    identity: { get: () => ({ anonymousId: 'alias-a', externalId: null }) },
    consent: { get: () => ({ survey: true, feedback: true }), allowsSurvey: () => true },
    transport: { instructions, surveysAvailable: available },
    storage: {
      getJson: async (key: string) => data.get(key) ?? null,
      setJson: async (key: string, value: unknown) => { data.set(key, value) },
      setJsonStrict: async (key: string, value: unknown) => { data.set(key, value) },
    },
    mutations: { size: () => 0, enqueue: vi.fn(async () => 'ack') },
    events: { emit }, localInstructionDedupe: { consume: () => false },
    locallyHandledSurveyIds: new Set<string>(),
  } as unknown as Engine
  return { engine, emit, instructions, available }
}

it('does not reopen an instruction-delivered survey from its legacy offer row', async () => {
  const h = harness()
  await consumeInstructions(h.engine, [offer()], false)
  await pollSurveyOffers(h.engine)
  expect(h.emit.mock.calls.filter(([name]) => name === 'surveyInvite')).toHaveLength(1)
})

it('reconciles the durable inbox before the legacy poll can request UI', async () => {
  const h = harness()
  await pollSurveyOffers(h.engine)
  await pollInstructions(h.engine)
  expect(h.emit.mock.calls.filter(([name]) => name === 'surveyInvite')).toHaveLength(1)
})

it('still presents a later valid event for the same repeatable campaign', async () => {
  const h = harness()
  await consumeInstructions(h.engine, [offer()], false)
  await pollSurveyOffers(h.engine)
  await consumeInstructions(h.engine, [offer(11)], false)
  expect(h.emit.mock.calls.filter(([name]) => name === 'surveyInvite')).toHaveLength(2)
})

it('keeps legacy scheduled offers when the inbox contains no matching delivery', async () => {
  const h = harness()
  h.instructions.mockResolvedValue({ instructions: [] })
  h.available.mockResolvedValue({ surveys: [{ id: 'scheduled', name: 'Scheduled', source: 'scheduled' }] })
  await pollSurveyOffers(h.engine)
  expect(h.emit).toHaveBeenCalledWith('surveyInvite', { surveyId: 'scheduled', name: 'Scheduled', source: 'scheduled' })
})

it('waits for an already in-flight instruction poll before consulting the legacy ledger', async () => {
  const h = harness()
  let resolve!: (value: { instructions: ReturnType<typeof offer>[] }) => void
  h.instructions.mockImplementation(() => new Promise(done => { resolve = done }))
  const pending = pollInstructions(h.engine)
  await vi.waitFor(() => expect(h.instructions).toHaveBeenCalledOnce())
  const legacy = pollSurveyOffers(h.engine)
  await Promise.resolve()
  const premature = h.available.mock.calls.length
  resolve({ instructions: [offer()] })
  await Promise.all([pending, legacy])
  expect(premature).toBe(0)
  expect(h.emit.mock.calls.filter(([name]) => name === 'surveyInvite')).toHaveLength(1)
})
