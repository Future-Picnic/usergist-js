import type { Engine } from './engine.js'
import { STORAGE_KEYS } from './storage.js'
import { reportError } from './debug.js'

export interface IdentityState {
  readonly status: 'anonymous' | 'identifying' | 'identified' | 'authentication-required' | 'resetting' | 'reset-failed' | 'rejected'
  readonly anonymousId: string
  readonly externalId: string | null
}
export type SubjectTokenProvider = (externalId: string) => Promise<string>
let provider: SubjectTokenProvider | undefined
let handler: ((state: IdentityState) => void) | undefined
let latest: IdentityState = { status: 'anonymous', anonymousId: '', externalId: null }
const refreshes = new WeakMap<Engine, Promise<boolean>>()
const lastRefresh = new WeakMap<Engine, number>()
const cancellations = new WeakMap<Engine, () => void>()
export function cancelIdentityRecovery(e: Engine): void { cancellations.get(e)?.() }
function requestFreshToken(e: Engine, externalId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, token?: string) => {
      clearTimeout(timer)
      if (cancellations.get(e) === cancel) cancellations.delete(e)
      if (error) reject(error); else resolve(token!)
    }
    const cancel = () => finish(new Error('identity-refresh-cancelled'))
    const timer = setTimeout(() => finish(new Error('identity-refresh-timeout')), 30_000)
    cancellations.set(e, cancel)
    Promise.resolve().then(() => provider!(externalId)).then(token => finish(undefined, token), error => finish(error))
  })
}
export function setIdentityStateHandler(next?: (state: IdentityState) => void): void {
  handler = next
  try { handler?.(latest) } catch (error) { reportError('identity observer failed', error) }
}
export function setSubjectTokenProvider(next?: SubjectTokenProvider): void { provider = next }
export function getIdentityState(): IdentityState { return latest }
export function identityChanged(e: Engine, status: IdentityState['status']): void {
  latest = Object.freeze({ ...e.identity.get(), status })
  try { handler?.(latest) } catch (error) { reportError('identity observer failed', error) }
}
/** A single backend refresh per identity generation; late callbacks cannot log
 * a signed-out account back in. No credential is ever included in an observer. */
export function recoverIdentity(e: Engine): Promise<boolean> {
  const pending = refreshes.get(e)
  if (pending) return pending
  identityChanged(e, 'authentication-required')
  const identity = e.identity.get()
  const generation = e.resetGeneration
  if (!provider || !identity.externalId || e.resetting || Date.now() - (lastRefresh.get(e) ?? 0) < 5000)
    return Promise.resolve(false)
  lastRefresh.set(e, Date.now())
  const current = () => !e.resetting && e.resetGeneration === generation && e.identity.get().externalId === identity.externalId
  const run = (async () => {
    try {
      let token = await requestFreshToken(e, identity.externalId!)
      if (!current() || !token.startsWith('st_')) return false
      const accepted = await e.transport.identify({ anonymousId: identity.anonymousId, externalId: identity.externalId!, ...(e.subjectToken ? { previousSubjectToken: e.subjectToken } : {}) }, token)
      token = accepted.subjectToken ?? token
      if (!current()) return false
      await e.storage.setJsonStrict(STORAGE_KEYS.subjectToken, token)
      if (!current()) return false
      const pendingIdentify = e.mutations.peek()
      if (pendingIdentify?.kind === 'identify' && pendingIdentify.payload.externalId === identity.externalId) {
        await e.mutations.enqueue('identify', 'essential', {
          ...pendingIdentify.payload, subjectToken: token,
        }, `identify:${identity.externalId}`)
        if (!current()) return false
      }
      if (accepted.properties) e.userState.replaceProperties(accepted.properties)
      e.subjectToken = token
      e.transport.setSubjectToken(token)
      identityChanged(e, 'identified')
      return true
    } catch (error) { reportError('subject token refresh failed', error); return false }
  })().finally(() => { if (refreshes.get(e) === run) refreshes.delete(e) })
  refreshes.set(e, run)
  return run
}
