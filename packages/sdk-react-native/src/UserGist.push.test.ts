import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ engine: null as any }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: vi.fn() } }))
vi.mock('./internal/engine.js', () => ({
  createEngine: () => fixture.engine,
  ensureHydrated: async () => {}, refreshTargetingRules: async () => {}, emitAppVersionChanged: async () => {},
  emitAppOpenWhenConsentReady: () => {}, pollInstructions: async () => {}, flushNow: async () => {},
  clearAllState: async (e: any) => { e.identity.get = () => ({ anonymousId: 'new-account', externalId: null }); e.lastPushToken = null; e.lastPushRegistrationKey = null },
}))
vi.mock('./internal/survey-store.js', () => ({ createSurveyStore: () => ({}) }))
vi.mock('./internal/push-dedupe.js', () => ({ hydratePushDedupe: async () => {}, acceptPushEvent: () => true }))
vi.mock('./native/push-bridge.js', () => ({
  UserGistPushNative: { syncState: async () => {}, disablePush: vi.fn(async () => {}), enablePush: vi.fn(), defaultEnvironment: async () => 'production' },
  onTokenReceived: vi.fn(), onTokenError: vi.fn(), onNotificationReceived: vi.fn(),
  onNotificationDisplayed: vi.fn(), onNotificationDismissed: vi.fn(), onNotificationOpened: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  let push = true
  let feedback = true
  let version = 0
  fixture.engine = {
    config: { writeKey: 'wk', apiUrl: 'https://api.usergist.com', environment: 'development' },
    identity: { get: () => ({ anonymousId: 'old-account', externalId: null }) },
    consent: { get: () => ({ push, feedback, version }), allowsPush: () => push, allowsFeedback: () => feedback, set: async (v: { push?: boolean; feedback?: boolean }) => { push = v.push ?? push; feedback = v.feedback ?? feedback; version++; return { push, feedback, version } } },
    lifecycle: { start() {} }, events: { emit: vi.fn() }, storage: { setJson: vi.fn(async () => {}) },
    resetting: false, resetGeneration: 0, lastPushToken: null, lastPushRegistrationKey: null, lastPushRegistrationAt: 0,
    transport: { pushRegisterToken: vi.fn(async () => {}), pushInvalidateToken: vi.fn(async () => {}), consent: vi.fn(async () => {}) },
  }
})

it('logout invalidates an in-flight registration before rotating identity', async () => {
  const { UserGist } = await import('./UserGist.js')
  await UserGist.initAsync(fixture.engine.config)
  let complete!: () => void
  fixture.engine.transport.pushRegisterToken.mockImplementationOnce(() => new Promise<void>(r => { complete = r }))
  const registration = UserGist.registerPushToken('device', 'ios')
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  const reset = UserGist.reset()
  await UserGist.registerPushToken('late-device', 'ios')
  expect(fixture.engine.transport.pushRegisterToken).toHaveBeenCalledTimes(1)
  complete(); await registration; await reset
  expect(fixture.engine.transport.pushInvalidateToken).toHaveBeenCalledWith({ anonymousId: 'old-account', token: 'device' })
  expect(UserGist.getAnonymousId()).toBe('new-account')
})

it('withdrawal drains registration and permits the same device to register after a later opt-in', async () => {
  const { UserGist } = await import('./UserGist.js')
  await UserGist.initAsync(fixture.engine.config)
  await UserGist.registerPushToken('device', 'ios')
  await UserGist.setConsent({ push: false })
  expect(fixture.engine.transport.pushInvalidateToken).toHaveBeenCalledOnce()
  await UserGist.setConsent({ push: true })
  await UserGist.registerPushToken('device', 'ios')
  expect(fixture.engine.transport.pushRegisterToken).toHaveBeenCalledTimes(2)
  expect(fixture.engine.transport.pushRegisterToken).toHaveBeenLastCalledWith(expect.objectContaining({ environment: 'production' }))
})

it('discards a previous account request list that finishes after logout', async () => {
  const { UserGist } = await import('./UserGist.js')
  await UserGist.initAsync(fixture.engine.config)
  let complete!: (value: unknown) => void
  fixture.engine.transport.requestsList = vi.fn(() => new Promise(resolve => { complete = resolve }))
  const pending = UserGist.getRequests({ mine: true })
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  await UserGist.reset()
  complete({ items: [{ id: 'private-old-account-request' }], nextCursor: 'old-cursor' })
  expect(await pending).toEqual({ items: [], nextCursor: null })
  expect(fixture.engine.events.emit).toHaveBeenCalledWith('resetSurfaces', undefined)
})

it('withdrawal discards an in-flight comment response and prevents new request reads', async () => {
  const { UserGist } = await import('./UserGist.js')
  await UserGist.initAsync(fixture.engine.config)
  let complete!: (value: unknown) => void
  fixture.engine.transport.requestCommentsList = vi.fn(() => new Promise(resolve => { complete = resolve }))
  fixture.engine.transport.requestsList = vi.fn()
  const pending = UserGist.getComments('request')
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  await UserGist.setConsent({ feedback: false })
  complete({ items: [{ id: 'comment' }] })
  expect(await pending).toEqual([])
  expect(await UserGist.getRequests()).toEqual({ items: [], nextCursor: null })
  expect(fixture.engine.transport.requestsList).not.toHaveBeenCalled()
  expect(fixture.engine.events.emit).toHaveBeenCalledWith('dismissRequests', undefined)
})

it('an old permission callback cannot disable push after logout and a new opt-in', async () => {
  const { UserGist } = await import('./UserGist.js')
  const { UserGistPushNative } = await import('./native/push-bridge.js')
  await UserGist.initAsync(fixture.engine.config)
  let complete!: (value: unknown) => void
  vi.mocked(UserGistPushNative.enablePush).mockImplementationOnce(() => new Promise(resolve => { complete = resolve as typeof complete }))
  const pending = UserGist.enablePush()
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  await UserGist.reset()
  await UserGist.setConsent({ push: true })
  vi.mocked(UserGistPushNative.enablePush).mockResolvedValueOnce({ granted: true, status: 'authorized', token: 'new-token', platform: 'ios' })
  expect((await UserGist.enablePush()).granted).toBe(true)
  const disables = vi.mocked(UserGistPushNative.disablePush).mock.calls.length
  complete({ granted: true, status: 'authorized', token: 'old-token', platform: 'ios' })
  expect((await pending).error).toBe('session_changed')
  expect(UserGistPushNative.disablePush).toHaveBeenCalledTimes(disables)
  expect(fixture.engine.transport.pushRegisterToken).toHaveBeenCalledTimes(1)
})
