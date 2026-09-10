import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  engine: null as any,
  pending: [] as any[],
}))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: vi.fn() },
}))
vi.mock('./internal/engine.js', () => ({
  createEngine: vi.fn(() => fixture.engine),
  ensureHydrated: async () => {},
  refreshTargetingRules: async () => {},
  emitAppVersionChanged: async () => {},
  emitAppOpenWhenConsentReady: () => {},
  pollInstructions: async () => {},
  flushNow: async () => {},
  // Deliberately never resolves: queued uploads must not hold survey opening.
  flushMutations: () => new Promise(() => {}),
}))
vi.mock('./internal/push-dedupe.js', () => ({
  hydratePushDedupe: async () => {},
}))
vi.mock('./native/push-bridge.js', () => ({
  UserGistPushNative: { syncState: async () => {} },
  onTokenReceived: vi.fn(),
  onTokenError: vi.fn(),
  onNotificationReceived: vi.fn(),
  onNotificationDisplayed: vi.fn(),
  onNotificationDismissed: vi.fn(),
  onNotificationOpened: vi.fn(),
}))
vi.mock('./internal/survey-store.js', () => ({
  createSurveyStore: () => ({
    findForSurvey: async (id: string) =>
      fixture.pending.find((a) => a.surveyId === id),
    upsert: async (a: any) => {
      fixture.pending = [
        ...fixture.pending.filter((b) => b.attemptId !== a.attemptId),
        a,
      ]
    },
  }),
}))
const survey = {
  id: 'survey',
  saveResumeWindowSeconds: 86400,
  flow: {
    startQuestionId: 'q1',
    questions: [{ id: 'q1', title: 'Original question' }],
  },
}
beforeEach(() => {
  vi.resetModules()
  fixture.pending = []
  fixture.engine = {
    config: {
      writeKey: 'wk',
      apiUrl: 'http://127.0.0.1:27743',
      environment: 'development',
    },
    identity: { get: () => ({ anonymousId: 'alias', externalId: null }) },
    consent: {
      get: () => ({ survey: true, version: 1 }),
      allowsSurvey: () => true,
      allowsPush: () => false,
    },
    resetting: false,
    resetGeneration: 0,
    lifecycle: { start() {} },
    events: { emit: vi.fn() },
    context: { platform: () => 'ios' },
    surveyRules: {
      getById: () => ({
        survey,
        localStart: {
          token: 'signed',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      }),
    },
    mutations: { enqueue: vi.fn(async () => 'mutation') },
    transport: {
      surveyCreateAttempt: vi.fn(async () => ({
        attemptId: 'server',
        startQuestionId: 'q1',
        currentQuestionId: 'q1',
        progressSnapshot: {},
        resumed: false,
      })),
    },
  }
})
async function sdk() {
  const { UserGist } = await import('./UserGist.js')
  await UserGist.initAsync(fixture.engine.config)
  return UserGist
}
it('opens a prepared survey with a durable stable attempt without waiting for any HTTP request', async () => {
  const client = await sdk()
  const result = await client.__internal_createAttempt(
    'survey',
    'triggered'
  )
  expect(result?.attemptId).toMatch(/^[a-f0-9-]{36}$/)
  expect(result?.resolvedContent).toEqual(survey)
  expect(
    fixture.engine.transport.surveyCreateAttempt
  ).not.toHaveBeenCalled()
  expect(fixture.engine.mutations.enqueue).toHaveBeenCalledWith(
    'survey-start',
    'survey',
    {
      surveyId: 'survey',
      body: expect.objectContaining({
        clientAttemptId: result?.attemptId,
        resume: false,
        localStart: { token: 'signed', startedAt: expect.any(String) },
      }),
    },
    `survey-start:${result?.attemptId}`
  )
  expect(fixture.pending[0].attemptId).toBe(result?.attemptId)
})
it('resumes the same saved questions and answers, repairing a start interrupted before enqueue', async () => {
  const client = await sdk()
  const first = await client.__internal_createAttempt('survey', 'triggered')
  fixture.pending[0].snapshot = { q1: 'saved answer' }
  fixture.pending[0].currentQuestionId = 'q2'
  fixture.engine.surveyRules.getById = () => ({
    survey: { ...survey, flow: { startQuestionId: 'different' } },
  })
  const resumed = await client.__internal_createAttempt(
    'survey',
    'on_demand'
  )
  expect(resumed).toMatchObject({
    attemptId: first?.attemptId,
    resumed: true,
    snapshot: { q1: 'saved answer' },
    currentQuestionId: 'q2',
    resolvedContent: survey,
  })
  expect(
    fixture.engine.transport.surveyCreateAttempt
  ).not.toHaveBeenCalled()
})
it('falls back for expired preparation and ignores a late response after reset', async () => {
  const client = await sdk()
  fixture.engine.surveyRules.getById = () => ({
    survey,
    localStart: { token: 'expired', expiresAt: '2000-01-01' },
  })
  let release!: (value: any) => void
  fixture.engine.transport.surveyCreateAttempt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  const pending = client.__internal_createAttempt('survey', 'triggered')
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  fixture.engine.resetGeneration++
  release({ attemptId: 'late' })
  expect(await pending).toBeNull()
  expect(fixture.pending).toEqual([])
})
it('uses a bundled authorized attempt without creating another session', async () => {
  const client = await sdk()
  const prepared = {
    attemptId: 'authorized-attempt',
    startQuestionId: 'q1',
    currentQuestionId: 'q1',
    progressSnapshot: {},
    resumed: false,
  }
  const result = await client.__internal_createAttempt(
    'survey',
    'triggered',
    undefined,
    'presentation',
    survey as any,
    prepared
  )
  expect(result?.attemptId).toBe('authorized-attempt')
  expect(
    fixture.engine.transport.surveyCreateAttempt
  ).not.toHaveBeenCalled()
  expect(fixture.engine.mutations.enqueue).not.toHaveBeenCalled()
})

it('shares overlapping local opens so one physical interaction starts one attempt', async () => {
  const client = await sdk()
  const [a, b] = await Promise.all([
    client.__internal_createAttempt('survey', 'triggered'),
    client.__internal_createAttempt('survey', 'triggered'),
  ])
  expect(a?.attemptId).toBe(b?.attemptId)
  expect(fixture.pending).toHaveLength(1)
  expect(fixture.engine.mutations.enqueue).toHaveBeenCalledOnce()
})

it('prepares sessions only while the SDK owns invitation presentation', async () => {
  const client = await sdk()
  const { createEngine } = await import('./internal/engine.js')
  const prepare = vi.mocked(createEngine).mock.calls.at(-1)![1]!
  expect(prepare()).toBe(true)
  client.setSurveyHandlers({ onInvite: vi.fn() })
  expect(prepare()).toBe(false)
  client.setSurveyHandlers({})
  expect(prepare()).toBe(true)
})
