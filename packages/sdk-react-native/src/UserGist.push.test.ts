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
vi.mock('./native/push-bridge.js', () => ({ UserGistPushNative: { syncState: async () => {}, disablePush: async () => {}, defaultEnvironment: async () => 'production' } }))

beforeEach(() => {
  vi.resetModules()
  let push = true
  fixture.engine = {
    config: { writeKey: 'wk', apiUrl: 'https://api.usergist.com', environment: 'development' },
    identity: { get: () => ({ anonymousId: 'old-account', externalId: null }) },
    consent: { allowsPush: () => push, set: async (v: { push: boolean }) => { push = v.push; return { push } } },
    lifecycle: { start() {} }, events: { emit() {} }, storage: { setJson: vi.fn(async () => {}) },
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
