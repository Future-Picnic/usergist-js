import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ consent: { push: true }, anonymous: null as string | null }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('../UserGist.js', () => ({ UserGist: { getAnonymousId: () => state.anonymous, __internal_state: () => state } }))
vi.mock('../index.js', () => ({ UserGist: {}, Push: {} }))
vi.mock('../Provider.js', () => ({ UserGistProvider: () => null }))
vi.mock('../Push.js', () => ({ Push: { registerDeviceToken: vi.fn(), handleReceived: vi.fn(), handleOpened: vi.fn(), handleSilentIfPresent: vi.fn(async () => false) } }))

function notifications() {
  const callbacks: Record<string, Function> = {}
  const removes: ReturnType<typeof vi.fn>[] = []
  const listen = (name: string) => vi.fn((listener: Function) => {
    callbacks[name] = listener
    const remove = vi.fn(); removes.push(remove); return { remove }
  })
  return {
    callbacks, removes,
    getPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
    requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
    getDevicePushTokenAsync: vi.fn(async () => ({ type: 'ios', data: 'apns-token' })),
    getLastNotificationResponseAsync: vi.fn(async () => null),
    setBadgeCountAsync: vi.fn(async () => true),
    setNotificationChannelAsync: vi.fn(async () => undefined),
    addPushTokenListener: listen('token'), addNotificationReceivedListener: listen('received'), addNotificationResponseReceivedListener: listen('response'),
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  }
}
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); state.consent.push = true; state.anonymous = null })
describe('Expo notifications integration', () => {
  it('configuration is inert, repeatable, and cleanup removes every listener', async () => {
    const { configureExpoNotifications } = await import('./index.js')
    const n = notifications(); const dispose = configureExpoNotifications(n)
    expect(configureExpoNotifications(n)).toBe(dispose)
    expect(n.getPermissionsAsync).not.toHaveBeenCalled()
    expect(n.getDevicePushTokenAsync).not.toHaveBeenCalled()
    expect(n.addNotificationReceivedListener).toHaveBeenCalledOnce()
    dispose(); dispose()
    n.removes.forEach(remove => expect(remove).toHaveBeenCalledOnce())
    const { getPushAdapter } = await import('../native/push-adapter.js')
    expect(getPushAdapter()).toBeNull()
  })
  it('uses native tokens and disabling does not touch host push registration', async () => {
    const { configureExpoNotifications } = await import('./index.js')
    const { getPushAdapter } = await import('../native/push-adapter.js')
    const { Push } = await import('../Push.js')
    const n = notifications(); const dispose = configureExpoNotifications(n)
    const adapter = getPushAdapter()!
    expect(await adapter.enablePush({ environment: 'production' })).toMatchObject({ granted: true, token: 'apns-token' })
    n.callbacks.token!({ type: 'ios', data: 'rotated-token' })
    expect(Push.registerDeviceToken).toHaveBeenCalledWith('rotated-token', 'ios', { environment: 'production' })
    await adapter.disablePush()
    n.callbacks.token!({ type: 'ios', data: 'later-token' })
    expect(Push.registerDeviceToken).toHaveBeenCalledTimes(1)
    dispose()
  })
  it('does not process unrelated notifications or callbacks after consent withdrawal', async () => {
    const { configureExpoNotifications } = await import('./index.js')
    const { getPushAdapter } = await import('../native/push-adapter.js')
    const { Push } = await import('../Push.js')
    const n = notifications(); const dispose = configureExpoNotifications(n)
    await getPushAdapter()!.enablePush({})
    n.callbacks.response!({ notification: { request: { identifier: 'host', content: { data: { order: 42 } } } }, actionIdentifier: n.DEFAULT_ACTION_IDENTIFIER })
    expect(Push.handleOpened).not.toHaveBeenCalled()
    const response = { notification: { request: { identifier: 'ug', content: { data: { usergist: { deliveryId: 'd', campaignId: 'c' } } } } }, actionIdentifier: n.DEFAULT_ACTION_IDENTIFIER }
    n.callbacks.response!(response)
    expect(Push.handleOpened).toHaveBeenCalledOnce()
    state.consent.push = false; n.callbacks.response!(response)
    expect(Push.handleOpened).toHaveBeenCalledOnce()
    dispose()
  })
  it('ignores old-account responses and Expo notifications without custom data', async () => {
    const { expoPushPayload } = await import('./index.js')
    state.anonymous = 'current-account'
    expect(expoPushPayload({ request: { identifier: 'host', content: {} } })).toBeNull()
    expect(expoPushPayload({ request: { identifier: 'old', content: { data: { usergist_anonymous_id: 'previous-account', usergist: { deliveryId: 'old-delivery' } } } } })).toBeNull()
  })
  it('rejects Expo service tokens and a token result arriving after disable', async () => {
    const { configureExpoNotifications } = await import('./index.js')
    const { getPushAdapter } = await import('../native/push-adapter.js')
    const n = notifications(); const dispose = configureExpoNotifications(n)
    n.getDevicePushTokenAsync.mockResolvedValueOnce({ type: 'ios', data: 'ExpoPushToken[wrong]' })
    await expect(getPushAdapter()!.enablePush({})).rejects.toThrow('native APNs/FCM token')
    const { Push } = await import('../Push.js')
    n.callbacks.token!({ type: 'ios', data: 'must-not-register' })
    expect(Push.registerDeviceToken).not.toHaveBeenCalled()
    let resolve!: (value: { type: string; data: string }) => void
    n.getDevicePushTokenAsync.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = getPushAdapter()!.enablePush({})
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    await getPushAdapter()!.disablePush(); resolve({ type: 'ios', data: 'old-token' })
    expect(await pending).toMatchObject({ granted: false })
    dispose()
  })
})
