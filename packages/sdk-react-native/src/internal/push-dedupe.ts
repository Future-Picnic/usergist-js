import { createStorageScope } from './storage.js'

let keys = new Set<string>()
let scope: ReturnType<typeof createStorageScope> | null = null
let storageKey = ''
let pending = Promise.resolve()
let revision = 0
export async function hydratePushDedupe(writeKey: string, anonymousId: string): Promise<void> {
  const nextKey = `push-receipts:${anonymousId}`
  if (storageKey === nextKey && scope) return
  const current = ++revision
  scope = createStorageScope(writeKey); storageKey = nextKey; keys = new Set()
  const saved = await scope.getJson<string[]>(nextKey)
  if (current === revision && Array.isArray(saved)) keys = new Set(saved.filter(v => typeof v === 'string').slice(-500))
}
export function acceptPushEvent(kind: string, deliveryId?: string, action?: string): boolean {
  if (!deliveryId) return true
  const key = JSON.stringify([kind, deliveryId, action ?? ''])
  if (keys.has(key)) return false
  keys.add(key)
  if (keys.size > 500) keys.delete(keys.values().next().value!)
  const target = scope, name = storageKey, saved = [...keys]
  if (target) pending = pending.then(() => target.setJson(name, saved)).catch(() => undefined)
  return true
}
