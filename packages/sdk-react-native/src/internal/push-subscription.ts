import type { Engine } from './engine.js'
import { reportError } from './debug.js'
export interface PushSubscriptionState {
  readonly tokenAvailable: boolean
  readonly registered: boolean
  readonly optedIn: boolean
  readonly anonymousId: string
  readonly externalId: string | null
}
let state: PushSubscriptionState = { tokenAvailable: false, registered: false, optedIn: false, anonymousId: '', externalId: null }
let handler: ((value: PushSubscriptionState) => void) | undefined
export function setPushSubscriptionStateHandler(next?: (value: PushSubscriptionState) => void) {
  handler = next
  emit()
}
function emit() { try { handler?.(state) } catch (error) { reportError('push observer failed', error) } }
export function pushSubscriptionChanged(e: Engine) {
  const id = e.identity.get(), optedIn = !e.resetting && e.consent.allowsPush()
  state = Object.freeze({ ...id, tokenAvailable: e.pushTokenAvailable ?? !!e.lastPushToken, optedIn,
    registered: optedIn && !!e.lastPushRegistrationKey?.startsWith(`${id.anonymousId}:${id.externalId ?? ''}:`) })
  emit()
}
