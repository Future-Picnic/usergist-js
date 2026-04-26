// TurboModule spec for the Ritmus push native module.
//
// React Native's codegen consumes this file and generates the native
// scaffolding that lets the new architecture (Bridgeless / Fabric)
// resolve our module without going through the legacy bridge.
//
// At runtime, `src/native/push-bridge.ts` first tries
// `TurboModuleRegistry.getEnforcing<Spec>('RitmusPush')` and falls back
// to `NativeModules.RitmusPush` so the package works in both
// architectures (RN 0.72 → 0.79+).

import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface EnablePushOptions {
  readonly skipPermissionRequestIfDenied?: boolean
  readonly environment?: 'sandbox' | 'production'
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
  // Required by RN's NativeEventEmitter on the new architecture.
  addListener(eventName: string): void
  removeListeners(count: number): void
}

export default TurboModuleRegistry.get<Spec>('RitmusPush')
