import { afterEach, expect, it, vi } from 'vitest'
import { cancelIdentityRecovery, getIdentityState, recoverIdentity, setIdentityStateHandler, setSubjectTokenProvider } from './identity-lifecycle.js'
import type { Engine } from './engine.js'
function fixture() {
  const identity = { anonymousId: 'installation-a', externalId: 'guest-backend-id' }
  return { identity: { get: () => identity }, resetGeneration: 0, resetting: false, subjectToken: 'st_expired',
    transport: { identify: vi.fn(async () => ({ ok: true, subjectToken: 'st_bound_new' })), setSubjectToken: vi.fn() },
    mutations: { peek: () => null }, storage: { setJsonStrict: vi.fn(async () => {}) },
  } as unknown as Engine
}
afterEach(() => { setSubjectTokenProvider(undefined); setIdentityStateHandler(undefined); vi.restoreAllMocks() })
it('renews once for concurrent 401s while retaining the guest backend ID and installation', async () => {
  const e = fixture(), states: string[] = []
  let resolve!: (token: string) => void
  const provider = vi.fn(() => new Promise<string>(done => { resolve = done }))
  setSubjectTokenProvider(provider)
  setIdentityStateHandler(state => states.push(state.status))
  const a = recoverIdentity(e), b = recoverIdentity(e)
  expect(a).toBe(b)
  await Promise.resolve()
  resolve('st_backend_new')
  expect(await a).toBe(true)
  expect(provider).toHaveBeenCalledOnce()
  expect(provider).toHaveBeenCalledWith('guest-backend-id')
  expect(e.transport.identify).toHaveBeenCalledWith({ anonymousId: 'installation-a', externalId: 'guest-backend-id', previousSubjectToken: 'st_expired' }, 'st_backend_new')
  expect(e.subjectToken).toBe('st_bound_new')
  expect(states.slice(-2)).toEqual(['authentication-required', 'identified'])
  expect(getIdentityState().externalId).toBe('guest-backend-id')
})
it('discards a backend token that arrives after logout', async () => {
  const e = fixture()
  let resolve!: (token: string) => void
  setSubjectTokenProvider(() => new Promise<string>(done => { resolve = done }))
  const pending = recoverIdentity(e)
  await Promise.resolve()
  e.resetGeneration++
  resolve('st_old_account')
  expect(await pending).toBe(false)
  expect(e.transport.identify).not.toHaveBeenCalled()
  expect(e.storage.setJsonStrict).not.toHaveBeenCalled()
})
it('retries a failed backend renewal after backoff without rotating identity', async () => {
  const e = fixture(), now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
  const provider = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('st_reconnected')
  setSubjectTokenProvider(provider)
  expect(await recoverIdentity(e)).toBe(false)
  expect(await recoverIdentity(e)).toBe(false)
  now.mockReturnValue(16_000)
  expect(await recoverIdentity(e)).toBe(true)
  expect(provider).toHaveBeenCalledTimes(2)
  expect(e.identity.get()).toEqual({ anonymousId: 'installation-a', externalId: 'guest-backend-id' })
})
it('observer exceptions cannot interrupt authentication recovery', async () => {
  const e = fixture()
  setIdentityStateHandler(() => { throw new Error('host callback') })
  setSubjectTokenProvider(async () => 'st_new')
  expect(await recoverIdentity(e)).toBe(true)
})

it('logout releases a token provider that never returns', async () => {
  const e = fixture()
  setSubjectTokenProvider(() => new Promise(() => {}))
  const pending = recoverIdentity(e)
  e.resetGeneration++
  cancelIdentityRecovery(e)
  expect(await pending).toBe(false)
  expect(e.transport.identify).not.toHaveBeenCalled()
})
