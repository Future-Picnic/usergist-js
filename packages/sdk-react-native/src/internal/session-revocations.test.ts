import { expect, it, vi } from 'vitest'
import type { Engine } from './engine.js'
import { STORAGE_KEYS } from './storage.js'
const network = vi.hoisted(() => ({ sends: [] as Array<{ token: string; anonymousId: string }>, fail: true }))
vi.mock('./transport.js', () => ({
  PermanentHttpError: class extends Error { constructor(public status: number) { super() } },
  createTransport: () => { let token = ''; return {
    setSubjectToken(value: string) { token = value },
    async revokeSession(anonymousId: string) { network.sends.push({ token, anonymousId }); if (network.fail) throw new Error('offline') },
  } },
}))
import { rememberRevocation, drainRevocations } from './session-revocations.js'
it('persists logout separately, coalesces retries, and never uses the next account credential', async () => {
  const values = new Map<string, unknown>()
  const storage = { getJson: async (key: string) => values.get(key), setJsonStrict: async (key: string, value: unknown) => { values.set(key, value) } }
  const e = { storage, subjectToken: 'st_account_a', identity: { get: () => ({ anonymousId: 'installation-a' }) }, config: { writeKey: 'public', apiUrl: 'https://example.test' } } as unknown as Engine
  await rememberRevocation(e)
  e.subjectToken = 'st_account_b'
  e.identity.get = () => ({ anonymousId: 'installation-b', externalId: 'account-b' })
  await rememberRevocation(e)
  expect(values.get(STORAGE_KEYS.sessionRevocations)).toHaveLength(1)
  await drainRevocations(e)
  expect(values.get(STORAGE_KEYS.sessionRevocations)).toHaveLength(1)
  network.fail = false
  // A new engine/storage session can finish cleanup after a process restart.
  await drainRevocations({ ...e, pendingReset: undefined } as Engine)
  expect(values.get(STORAGE_KEYS.sessionRevocations)).toEqual([])
  expect(network.sends).toEqual([{ token: 'st_account_a', anonymousId: 'installation-a' }, { token: 'st_account_a', anonymousId: 'installation-a' }])
  expect(e.subjectToken).toBe('st_account_b')
})
