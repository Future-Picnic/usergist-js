import {beforeEach, expect, it, vi} from 'vitest'

const fixture = vi.hoisted(() => ({engine: null as any}))
vi.mock('react-native', () => ({Platform: {OS: 'ios'}, AppState: {addEventListener: vi.fn()}}))
vi.mock('./internal/engine.js', () => ({
  createEngine: () => fixture.engine,
  ensureHydrated: async () => {}, refreshTargetingRules: async () => {},
  emitAppVersionChanged: async () => {}, emitAppOpenWhenConsentReady: () => {},
  pollInstructions: async () => {},
}))
vi.mock('./internal/push-dedupe.js', () => ({hydratePushDedupe: async () => {}}))
vi.mock('./native/push-bridge.js', () => ({
  UserGistPushNative: {syncState: vi.fn(async () => {}), enablePush: vi.fn(), getInitialNotification: vi.fn(async () => null as any)},
  onTokenReceived: vi.fn(), onTokenError: vi.fn(), onNotificationReceived: vi.fn(),
  onNotificationDisplayed: vi.fn(), onNotificationDismissed: vi.fn(), onNotificationOpened: vi.fn(),
}))
vi.mock('./Push.js', () => ({Push: {handleOpened: vi.fn()},clearPendingPushCallbacks:vi.fn()}))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  fixture.engine = {
    config: {writeKey: 'wk', apiUrl: 'https://qa.invalid'},
    identity: {get: () => ({anonymousId: 'current', externalId: null})},
    consent: {allowsPush: () => true, get: () => ({push: true, version: 1})},
    lifecycle: {start() {}}, resetting: false, resetGeneration: 0,
  }
})

it('reads a persisted all-denied choice without changing its revision or exposing mutable state', async () => {
  const saved = {analytics: false, feedback: false, push: false, survey: false, version: 7, updatedAt: '2026-11-11T22:00:00Z'}
  fixture.engine.consent.get = () => saved
  fixture.engine.consent.allowsPush = () => false
  fixture.engine.consent.set = vi.fn()
  const {UserGist} = await import('./UserGist.js')
  await UserGist.initAsync(fixture.engine.config)
  const read = await UserGist.getConsent()
  expect(read).toEqual(saved)
  ;(read as {push: boolean}).push = true
  expect((await UserGist.getConsent()).push).toBe(false)
  expect(fixture.engine.consent.set).not.toHaveBeenCalled()
  expect(saved.version).toBe(7)
})

it('restores notification listeners at hydrated initialization without requesting permission', async () => {
  const {UserGist} = await import('./UserGist.js')
  const native = await import('./native/push-bridge.js')
  await UserGist.initAsync(fixture.engine.config)
  await UserGist.initAsync(fixture.engine.config)
  expect(native.onNotificationOpened).toHaveBeenCalledOnce()
  expect(native.onNotificationReceived).toHaveBeenCalledOnce()
  expect(native.UserGistPushNative.enablePush).not.toHaveBeenCalled()
})

it('forwards a restored cold-open callback only for the current opted-in installation', async () => {
  const {UserGist} = await import('./UserGist.js')
  const native = await import('./native/push-bridge.js')
  const {Push} = await import('./Push.js')
  await UserGist.initAsync(fixture.engine.config)
  expect(native.onNotificationOpened).toHaveBeenCalledOnce()
  const opened = vi.mocked(native.onNotificationOpened).mock.calls[0][0]
  opened({deliveryId: 'delivery', data: {usergist_anonymous_id: 'current'}})
  expect(Push.handleOpened).toHaveBeenCalledOnce()
  opened({deliveryId: 'stale', data: {usergist_anonymous_id: 'previous'}})
  fixture.engine.consent.allowsPush = () => false
  opened({deliveryId: 'withdrawn', data: {usergist_anonymous_id: 'current'}})
  expect(Push.handleOpened).toHaveBeenCalledOnce()
})

it('pulls a launch intent missed before JS subscriptions after hydration, without enabling push again', async () => {
  const {UserGist} = await import('./UserGist.js')
  const native = await import('./native/push-bridge.js')
  const {Push} = await import('./Push.js')
  native.UserGistPushNative.getInitialNotification.mockResolvedValueOnce({deliveryId:'cold',data:{usergist_campaign_id:'campaign',usergist_anonymous_id:'current',usergist_open_action:JSON.stringify({action:'json',actionJson:{code:'00123',number:1234,enabled:true,value:null,nested:{enabled:false}}})}})
  await UserGist.initAsync(fixture.engine.config)
  expect(Push.handleOpened).toHaveBeenCalledOnce()
  expect(native.UserGistPushNative.enablePush).not.toHaveBeenCalled()
  expect(native.UserGistPushNative.syncState.mock.invocationCallOrder[0]).toBeLessThan(native.UserGistPushNative.getInitialNotification.mock.invocationCallOrder[0])
  expect(native.onNotificationOpened.mock.invocationCallOrder[0]).toBeLessThan(native.UserGistPushNative.getInitialNotification.mock.invocationCallOrder[0])
})

it('does not execute a pulled cold-open for a previous user or revoked push consent', async () => {
  const {UserGist} = await import('./UserGist.js')
  const native = await import('./native/push-bridge.js')
  const {Push} = await import('./Push.js')
  native.UserGistPushNative.getInitialNotification.mockResolvedValueOnce({deliveryId:'old',data:{usergist_anonymous_id:'previous'}})
  await UserGist.initAsync(fixture.engine.config)
  fixture.engine.consent.allowsPush=()=>false
  native.UserGistPushNative.getInitialNotification.mockResolvedValueOnce({deliveryId:'revoked',data:{usergist_anonymous_id:'current'}})
  await UserGist.initAsync(fixture.engine.config)
  expect(Push.handleOpened).not.toHaveBeenCalled()
})
