import { expect, it, vi } from 'vitest'
import type { Engine } from './engine.js'
import { STORAGE_KEYS } from './storage.js'
const network = vi.hoisted(() => ({ sends: [] as Array<{ token: string; anonymousId: string }>, fail: true, status: 0 }))
vi.mock('./transport.js', () => ({
  PermanentHttpError: class extends Error { constructor(public status: number) { super() } },
  createTransport: () => { let token = ''; return {
    setSubjectToken(value: string) { token = value },
    async revokeSession(anonymousId: string) { network.sends.push({ token, anonymousId }); if (network.status) { const { PermanentHttpError } = await import('./transport.js'); throw new PermanentHttpError(network.status) } if (network.fail) throw new Error('offline') },
  } },
}))
import { rememberRevocation, drainRevocations, hasPendingRevocations } from './session-revocations.js'
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

it.each([401, 403, 429, 503])('handles logout HTTP %s without blocking a new account on terminal credentials', async status => {
  const values = new Map<string, unknown>()
  const e = { storage: { getJson: async (key: string) => values.get(key), setJsonStrict: async (key: string, value: unknown) => { values.set(key, value) } }, subjectToken: 'st_old', identity: { get: () => ({ anonymousId: 'old-installation' }) }, config: { writeKey: 'public', apiUrl: 'https://example.test' } } as unknown as Engine
  await rememberRevocation(e)
  e.subjectToken = 'st_current'
  network.status = status
  try {
    await drainRevocations(e)
    expect(await hasPendingRevocations(e)).toBe(status !== 401 && status !== 403)
    expect(e.subjectToken).toBe('st_current')
  } finally { network.status = 0 }
})
