// AsyncStorage wrapper with:
//  - Lazy require (no hard dep at import time)
//  - Per-writeKey key prefix (multi-app safety on the same device)
//  - JSON (de)serialization with graceful corruption handling
//
// We accept that AsyncStorage is a peer dep; if the host app hasn't installed
// it, the SDK degrades to an in-memory store so `track()` still works but
// nothing persists across launches.

import { reportError } from './debug.js'

export interface UserGistStorageAdapter {
  readonly getItem: (k: string) => Promise<string | null>
  readonly setItem: (k: string, v: string) => Promise<void>
  readonly removeItem: (k: string) => Promise<void>
  readonly multiRemove?: (keys: ReadonlyArray<string>) => Promise<void>
}

type AsyncStorageLike = UserGistStorageAdapter

interface NativeSecureStorageLike {
  readonly secureGetItem: (key: string) => Promise<string | null>
  readonly secureSetItem: (key: string, value: string) => Promise<void>
  readonly secureRemoveItem: (key: string) => Promise<void>
  readonly secureMultiRemove: (keys: ReadonlyArray<string>) => Promise<void>
}

let cached: AsyncStorageLike | null = null
let checked = false
let customAdapter: UserGistStorageAdapter | null = null

/** Configure a host-owned encrypted key/value backend before `init()`. */
export function configureStorageAdapter(adapter: UserGistStorageAdapter): void {
  customAdapter = adapter
}

declare const require: (id: string) => unknown

function loadAsyncStorage(): AsyncStorageLike | null {
  if (checked) return cached
  checked = true
  try {
    const mod = require('@react-native-async-storage/async-storage') as
      | { default?: AsyncStorageLike }
      | AsyncStorageLike
      | undefined
    const impl: AsyncStorageLike | undefined =
      (mod && 'default' in mod ? mod.default : (mod as AsyncStorageLike | undefined)) ?? undefined
    cached = impl ?? null
  } catch {
    cached = null
  }
  return cached
}

// Small in-memory fallback
const memoryStore = new Map<string, string>()
const memoryImpl: AsyncStorageLike = {
  getItem: async (k) => memoryStore.get(k) ?? null,
  setItem: async (k, v) => {
    memoryStore.set(k, v)
  },
  removeItem: async (k) => {
    memoryStore.delete(k)
  },
  multiRemove: async (keys) => {
    for (const k of keys) memoryStore.delete(k)
  },
}

// Credential-bearing values must never silently degrade to AsyncStorage.
// When the native module is unavailable (for example Expo Go), keep them only
// in process memory and report the loss of relaunch durability.
const secureMemoryStore = new Map<string, string>()
const secureMemoryImpl: AsyncStorageLike = {
  getItem: async (k) => secureMemoryStore.get(k) ?? null,
  setItem: async (k, v) => { secureMemoryStore.set(k, v) },
  removeItem: async (k) => { secureMemoryStore.delete(k) },
  multiRemove: async (keys) => { for (const k of keys) secureMemoryStore.delete(k) },
}

let nativeSecureChecked = false
let nativeSecure: AsyncStorageLike | null = null
let warnedSecureFallback = false

function loadNativeSecureStorage(): AsyncStorageLike | null {
  if (nativeSecureChecked) return nativeSecure
  nativeSecureChecked = true
  try {
    const rn = require('react-native') as {
      NativeModules?: { UserGistPush?: NativeSecureStorageLike }
    }
    const module = rn.NativeModules?.UserGistPush
    if (!module?.secureGetItem || !module.secureSetItem || !module.secureRemoveItem) {
      return null
    }
    nativeSecure = {
      getItem: (key) => module.secureGetItem(key),
      setItem: (key, value) => module.secureSetItem(key, value),
      removeItem: (key) => module.secureRemoveItem(key),
      multiRemove: (keys) => module.secureMultiRemove(keys),
    }
  } catch {
    nativeSecure = null
  }
  return nativeSecure
}

function credentialBackend(): AsyncStorageLike {
  if (customAdapter) return customAdapter
  const native = loadNativeSecureStorage()
  if (native) return native
  if (!warnedSecureFallback) {
    warnedSecureFallback = true
    reportError(
      'native secure storage unavailable; subject credentials are memory-only until the app is rebuilt with the UserGist native module',
    )
  }
  return secureMemoryImpl
}

function backend(): AsyncStorageLike {
  return customAdapter ?? loadAsyncStorage() ?? memoryImpl
}

// Non-crypto stable hash of the writeKey → short prefix
function hashKey(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

export interface StorageScope {
  readonly key: (suffix: string) => string
  readonly getJson: <T>(suffix: string) => Promise<T | null>
  readonly setJson: <T>(suffix: string, value: T) => Promise<void>
  readonly setJsonStrict: <T>(suffix: string, value: T) => Promise<void>
  readonly remove: (suffix: string) => Promise<void>
  readonly clearAll: (suffixes: ReadonlyArray<string>) => Promise<void>
}

export function createStorageScope(writeKey: string): StorageScope {
  const prefix = `@usergist/${hashKey(writeKey)}/`
  const key = (suffix: string): string => `${prefix}${suffix}`
  const isCredential = (suffix: string): boolean =>
    suffix === STORAGE_KEYS.subjectToken || suffix === STORAGE_KEYS.mutationQueue
  const implementation = (suffix: string): AsyncStorageLike =>
    isCredential(suffix) ? credentialBackend() : backend()
  return {
    key,
    async getJson<T>(suffix: string): Promise<T | null> {
      try {
        const impl = implementation(suffix)
        let raw = await impl.getItem(key(suffix))
        // One-time migration from older SDK builds that stored credentials in
        // AsyncStorage. Always remove the plaintext copy, even if a native
        // secure-store write fails, so migration cannot preserve credentials
        // in an unencrypted backend.
        if (raw == null && isCredential(suffix) && !customAdapter) {
          const legacy = loadAsyncStorage()
          const old = await legacy?.getItem(key(suffix))
          if (old != null) {
            try {
              await impl.setItem(key(suffix), old)
            } finally {
              await legacy?.removeItem(key(suffix))
            }
            raw = old
          }
        }
        if (raw == null) return null
        return JSON.parse(raw) as T
      } catch (e) {
        reportError('storage.getJson failed', e)
        return null
      }
    },
    async setJson<T>(suffix: string, value: T): Promise<void> {
      try {
        await implementation(suffix).setItem(key(suffix), JSON.stringify(value))
      } catch (e) {
        reportError('storage.setJson failed', e)
      }
    },
    async setJsonStrict<T>(suffix: string, value: T): Promise<void> {
      await implementation(suffix).setItem(key(suffix), JSON.stringify(value))
    },
    async remove(suffix: string): Promise<void> {
      try {
        await implementation(suffix).removeItem(key(suffix))
        if (isCredential(suffix) && !customAdapter) {
          await loadAsyncStorage()?.removeItem(key(suffix))
        }
      } catch (e) {
        reportError('storage.remove failed', e)
      }
    },
    async clearAll(suffixes: ReadonlyArray<string>): Promise<void> {
      try {
        const normal = suffixes.filter((suffix) => !isCredential(suffix)).map(key)
        const credentials = suffixes.filter(isCredential).map(key)
        const normalImpl = backend()
        const credentialImpl = credentialBackend()
        if (normal.length > 0) {
          if (normalImpl.multiRemove) await normalImpl.multiRemove(normal)
          else await Promise.all(normal.map((k) => normalImpl.removeItem(k)))
        }
        if (credentials.length > 0) {
          if (credentialImpl.multiRemove) await credentialImpl.multiRemove(credentials)
          else await Promise.all(credentials.map((k) => credentialImpl.removeItem(k)))
          if (!customAdapter) {
            const legacy = loadAsyncStorage()
            if (legacy?.multiRemove) await legacy.multiRemove(credentials)
            else await Promise.all(credentials.map((k) => legacy?.removeItem(k)))
          }
        }
      } catch (e) {
        reportError('storage.clearAll failed', e)
      }
    },
  }
}

export const STORAGE_KEYS = {
  identity: 'identity',
  consent: 'consent',
  queue: 'queue',
  rulesCache: 'rulesCache',
  surveyRulesCache: 'surveyRulesCache',
  inAppRulesCache: 'inAppRulesCache',
  frequencyCaps: 'frequencyCaps',
  userProperties: 'userProperties',
  eventHistory: 'eventHistory',
  subjectToken: 'subjectToken',
  mutationQueue: 'mutationQueue',
  instructionCursor: 'instructionCursor',
  seenInstructions: 'seenInstructions',
  localInstructionDedupe: 'localInstructionDedupe',
  appVersion: 'appVersion',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
