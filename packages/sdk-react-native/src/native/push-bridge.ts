// Runtime bridge to the UserGist native push module.
//
// Strategy:
//   1. Try TurboModuleRegistry first (new architecture). If available, use it.
//   2. Fallback to legacy `NativeModules.UserGistPush`.
//   3. If neither is present (e.g., autolinking didn't run, or the consumer
//      is on Expo Go), expose a stub that resolves to `{ granted: false,
//      status: 'denied' }` so JS-side code never crashes — host devs see a
//      clear console warning explaining what to do.

import { NativeEventEmitter, NativeModules, Platform } from 'react-native'
import type { Spec, EnablePushOptions, EnablePushResult, PushPermissionStatus } from '../NativeUserGistPush.js'
import TurboModule from '../NativeUserGistPush.js'
import {
  USERGIST_PUSH_EVENTS,
  type NotificationPayload,
  type UserGistPushEventName,
  type TokenErrorPayload,
  type TokenReceivedPayload,
} from './events.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LegacyModule: Spec | undefined = (NativeModules as any).UserGistPush

const Module: Spec | null = TurboModule ?? LegacyModule ?? null

let warned = false
function warnMissing(): void {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    '[usergist] Native push module not found. Make sure @usergist/feedback-react-native is installed and rebuild the app (`pod install` for iOS, rebuild for Android). Push acquisition is disabled until then.',
  )
}

const STUB_RESULT: EnablePushResult = {
  granted: false,
  status: 'denied',
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
}

export const UserGistPushNative = {
  isAvailable(): boolean {
    return Module != null
  },

  async enablePush(options: EnablePushOptions = {}): Promise<EnablePushResult> {
    if (!Module) {
      warnMissing()
      return STUB_RESULT
    }
    return Module.enablePush(options as unknown as { [key: string]: unknown })
  },

  async disablePush(): Promise<void> {
    if (!Module) {
      warnMissing()
      return
    }
    await Module.disablePush()
  },

  async getPermissionStatus(): Promise<PushPermissionStatus> {
    if (!Module) return 'denied'
    return Module.getPushPermissionStatus()
  },

  async setBadgeCount(count: number): Promise<void> {
    if (!Module) return
    await Module.setBadgeCount(count)
  },

  async getInitialNotification(): Promise<NotificationPayload | null> {
    if (!Module) return null
    const raw = await Module.getInitialNotification()
    return raw as NotificationPayload | null
  },
}

// ---------- NativeEventEmitter ----------

let emitter: NativeEventEmitter | null = null
function getEmitter(): NativeEventEmitter | null {
  if (!Module) return null
  if (!emitter) {
    // RN >= 0.65 accepts undefined for non-iOS modules; the legacy iOS
    // RCTEventEmitter requires the module reference. Cast through unknown
    // because the public `NativeEventEmitter` constructor signature isn't
    // compatible with TurboModule's stronger typing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitter = new NativeEventEmitter(Module as any)
  }
  return emitter
}

export interface PushEventSubscription {
  remove(): void
}

export function onPushEvent<T = unknown>(
  name: UserGistPushEventName,
  cb: (payload: T) => void,
): PushEventSubscription {
  const e = getEmitter()
  if (!e) return { remove: () => undefined }
  const sub = e.addListener(name, cb as (event: unknown) => void)
  return { remove: () => sub.remove() }
}

// Typed convenience wrappers — use these from UserGist.ts so the payload
// shapes are compile-checked at call sites.
export const onTokenReceived = (cb: (p: TokenReceivedPayload) => void) =>
  onPushEvent<TokenReceivedPayload>(USERGIST_PUSH_EVENTS.TOKEN_RECEIVED, cb)
export const onTokenError = (cb: (p: TokenErrorPayload) => void) =>
  onPushEvent<TokenErrorPayload>(USERGIST_PUSH_EVENTS.TOKEN_ERROR, cb)
export const onNotificationReceived = (cb: (p: NotificationPayload) => void) =>
  onPushEvent<NotificationPayload>(USERGIST_PUSH_EVENTS.NOTIFICATION_RECEIVED, cb)
export const onNotificationOpened = (cb: (p: NotificationPayload) => void) =>
  onPushEvent<NotificationPayload>(USERGIST_PUSH_EVENTS.NOTIFICATION_OPENED, cb)

export type { EnablePushOptions, EnablePushResult, PushPermissionStatus }
