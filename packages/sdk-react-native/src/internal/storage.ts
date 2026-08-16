// AsyncStorage wrapper with:
//  - Lazy require (no hard dep at import time)
//  - Per-writeKey key prefix (multi-app safety on the same device)
//  - JSON (de)serialization with graceful corruption handling
//
// We accept that AsyncStorage is a peer dep; if the host app hasn't installed
// it, the SDK degrades to an in-memory store so `track()` still works but
// nothing persists across launches.

import { reportError } from './debug.js'

type AsyncStorageLike = {
  readonly getItem: (k: string) => Promise<string | null>
  readonly setItem: (k: string, v: string) => Promise<void>
  readonly removeItem: (k: string) => Promise<void>
  readonly multiRemove?: (keys: ReadonlyArray<string>) => Promise<void>
}

let cached: AsyncStorageLike | null = null
let checked = false

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

function backend(): AsyncStorageLike {
  return loadAsyncStorage() ?? memoryImpl
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
  readonly remove: (suffix: string) => Promise<void>
  readonly clearAll: (suffixes: ReadonlyArray<string>) => Promise<void>
}

export function createStorageScope(writeKey: string): StorageScope {
  const prefix = `@usergist/${hashKey(writeKey)}/`
  const key = (suffix: string): string => `${prefix}${suffix}`
  return {
    key,
    async getJson<T>(suffix: string): Promise<T | null> {
      try {
        const raw = await backend().getItem(key(suffix))
        if (raw == null) return null
        return JSON.parse(raw) as T
      } catch (e) {
        reportError('storage.getJson failed', e)
        return null
      }
    },
    async setJson<T>(suffix: string, value: T): Promise<void> {
      try {
        await backend().setItem(key(suffix), JSON.stringify(value))
      } catch (e) {
        reportError('storage.setJson failed', e)
      }
    },
    async remove(suffix: string): Promise<void> {
      try {
        await backend().removeItem(key(suffix))
      } catch (e) {
        reportError('storage.remove failed', e)
      }
    },
    async clearAll(suffixes: ReadonlyArray<string>): Promise<void> {
      try {
        const impl = backend()
        const fullKeys = suffixes.map((s) => key(s))
        if (impl.multiRemove) {
          await impl.multiRemove(fullKeys)
          return
        }
        await Promise.all(fullKeys.map((k) => impl.removeItem(k)))
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
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
