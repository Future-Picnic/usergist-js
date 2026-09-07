// Typed runtime lookup for the UserGist native bridge, not a codegen input.
// Both native implementations ship their own bridge registration and do not
// implement generated spec classes. Do not advertise this file through
// codegenConfig unless the native implementations are migrated as well.
// `src/native/push-bridge.ts` falls back to NativeModules.UserGistPush when
// this optional TurboModuleRegistry lookup returns null.

import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface EnablePushOptions {
  readonly skipPermissionRequestIfDenied?: boolean
  readonly environment?: 'sandbox' | 'production'
  /** Disable delegate interception when the host forwards tokens/messages via Push. */
  readonly installDelegateProxy?: boolean
}

export interface EnablePushResult {
  readonly granted: boolean
  readonly status: 'authorized' | 'provisional' | 'denied' | 'not_determined'
  readonly token?: string
  readonly platform: 'ios' | 'android'
  readonly error?: string
}

export type PushPermissionStatus =
  | 'authorized'
  | 'provisional'
  | 'denied'
  | 'not_determined'

export interface Spec extends TurboModule {
  enablePush(options: { [key: string]: unknown } | null): Promise<EnablePushResult>
  disablePush(): Promise<void>
  getPushPermissionStatus(): Promise<PushPermissionStatus>
  setBadgeCount(count: number): Promise<void>
  getInitialNotification(): Promise<{ [key: string]: unknown } | null>
  secureGetItem(key: string): Promise<string | null>
  secureSetItem(key: string, value: string): Promise<void>
  secureRemoveItem(key: string): Promise<void>
  secureMultiRemove(keys: ReadonlyArray<string>): Promise<void>
  // Required by RN's NativeEventEmitter on the new architecture.
  addListener(eventName: string): void
  removeListeners(count: number): void
}

export default TurboModuleRegistry.get<Spec>('UserGistPush')
