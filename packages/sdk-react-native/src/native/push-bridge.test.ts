import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ module: null as any }))
vi.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'ios' }, NativeEventEmitter: vi.fn() }))
vi.mock('../NativeUserGistPush.js', () => ({ get default() { return state.module } }))
beforeEach(() => { vi.resetModules(); state.module = null })

it('reports a missing development-build module without calling it denied permission', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { UserGistPushNative } = await import('./push-bridge.js')
  expect(await UserGistPushNative.enablePush()).toMatchObject({ granted: false, status: 'not_determined', error: 'native_module_unavailable' })
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('Expo development build'))
  warn.mockRestore()
})

it('base Expo configuration cannot activate native processing through consent alone', async () => {
  state.module = { getPushConfiguration: vi.fn(async () => ({ mode: 'disabled' })), configurePushState: vi.fn() }
  const { UserGistPushNative } = await import('./push-bridge.js')
  await UserGistPushNative.syncState({ writeKey: 'wk', apiUrl: 'https://api.usergist.com', anonymousId: 'anon', push: true })
  expect(state.module.configurePushState).toHaveBeenCalledWith(expect.objectContaining({ push: false }))
  expect(await UserGistPushNative.enablePush()).toMatchObject({ error: 'push_not_configured' })
})

it('coexistence requires its configured adapter and keeps APNs signing separate from data environments', async () => {
  state.module = { getPushConfiguration: vi.fn(async () => ({ mode: 'expo-notifications', environment: 'production' })) }
  const { UserGistPushNative } = await import('./push-bridge.js')
  expect(await UserGistPushNative.defaultEnvironment()).toBe('production')
  expect(await UserGistPushNative.enablePush()).toMatchObject({ error: 'expo_adapter_required', status: 'not_determined' })
})
