import type { Engine } from './engine.js'
import { createTransport, PermanentHttpError } from './transport.js'
import { STORAGE_KEYS } from './storage.js'
import { generateEventId } from './identity.js'

interface Revocation { id: string; subjectToken: string; anonymousId: string }
const operations = new WeakMap<Engine, Promise<unknown>>()
const drains = new WeakMap<Engine, Promise<void>>()
function serial<T>(e: Engine, body: () => Promise<T>): Promise<T> {
  const task = (operations.get(e) ?? Promise.resolve()).catch(() => {}).then(body)
  operations.set(e, task)
  return task
}
export async function rememberRevocation(e: Engine): Promise<void> {
  if (!e.pendingReset) {
    const subjectToken = e.subjectToken ?? await e.storage.getJson<string>(STORAGE_KEYS.subjectToken)
    if (subjectToken) e.pendingReset = { subjectToken, anonymousId: e.identity.get().anonymousId }
  }
  if (!e.pendingReset) return
  const entry: Revocation = { id: generateEventId(), ...e.pendingReset }
  await serial(e, async () => {
    const items = await e.storage.getJson<Revocation[]>(STORAGE_KEYS.sessionRevocations) ?? []
    if (items.some(item => item.subjectToken === entry.subjectToken && item.anonymousId === entry.anonymousId)) return
    await e.storage.setJsonStrict(STORAGE_KEYS.sessionRevocations, [...items, entry])
  })
}
export function drainRevocations(e: Engine): Promise<void> {
  const pending = drains.get(e)
  if (pending) return pending
  const run = (async () => {
    const items = await serial(e, () => e.storage.getJson<Revocation[]>(STORAGE_KEYS.sessionRevocations)) ?? []
    for (const item of items) {
      const transport = createTransport({ writeKey: e.config.writeKey, apiUrl: e.config.apiUrl })
      transport.setSubjectToken(item.subjectToken)
      try { await transport.revokeSession(item.anonymousId) }
      catch (error) {
        // Unknown/deleted credentials cannot authorize any more work. Other
        // failures leave the cleanup record in secure storage for a later run.
        if (!(error instanceof PermanentHttpError && error.status === 401)) return
      }
      await serial(e, async () => {
        const current = await e.storage.getJson<Revocation[]>(STORAGE_KEYS.sessionRevocations) ?? []
        await e.storage.setJsonStrict(STORAGE_KEYS.sessionRevocations, current.filter(entry => entry.id !== item.id))
      })
    }
  })().finally(() => { if (drains.get(e) === run) drains.delete(e) })
  drains.set(e, run)
  return run
}

export async function hasPendingRevocations(e: Engine): Promise<boolean> {
  return (await serial(e, () => e.storage.getJson<Revocation[]>(STORAGE_KEYS.sessionRevocations)) ?? []).length > 0
}
