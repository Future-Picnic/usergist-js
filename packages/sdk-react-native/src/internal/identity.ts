// Identity manager: anonymous id + external id persistence.
// Anonymous id is generated on first use (21 chars, URL-safe alphabet,
// nanoid-compatible) and persisted to storage; rotated on `reset()`.
//
// We inline the id generator instead of pulling `nanoid` to avoid forcing
// the host app to install the `react-native-get-random-values` polyfill.
// We prefer `crypto.getRandomValues` when available (Hermes exposes it via
// RN's polyfill) and fall back to `Math.random` — this is not
// security-critical (analytics correlation only).

import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type { IdentityState } from './types.js'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
const ID_LENGTH = 21

type CryptoLike = { readonly getRandomValues: (buf: Uint8Array) => Uint8Array }

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n)
  const g = globalThis as {
    crypto?: CryptoLike
    msCrypto?: CryptoLike
  }
  const c = g.crypto ?? g.msCrypto
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr)
    return arr
  }
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256)
  return arr
}

export function generateAnonymousId(): string {
  const bytes = randomBytes(ID_LENGTH)
  let out = ''
  for (let i = 0; i < ID_LENGTH; i++) {
    const b = bytes[i] ?? 0
    out += ALPHABET[b & 63]
  }
  return out
}

export interface IdentityManager {
  readonly get: () => IdentityState
  readonly hydrate: () => Promise<IdentityState>
  readonly setExternalId: (id: string) => Promise<IdentityState>
  readonly rotate: () => Promise<IdentityState>
  readonly clear: () => Promise<IdentityState>
}

export function createIdentityManager(storage: StorageScope): IdentityManager {
  let state: IdentityState = { anonymousId: '', externalId: null }
  let hydrated = false
  let hydratingPromise: Promise<IdentityState> | null = null

  async function persist(next: IdentityState): Promise<void> {
    await storage.setJson(STORAGE_KEYS.identity, next)
  }

  async function hydrate(): Promise<IdentityState> {
    if (hydrated) return state
    if (hydratingPromise) return hydratingPromise
    hydratingPromise = (async (): Promise<IdentityState> => {
      try {
        const stored = await storage.getJson<IdentityState>(STORAGE_KEYS.identity)
        if (stored && typeof stored.anonymousId === 'string' && stored.anonymousId.length > 0) {
          state = {
            anonymousId: stored.anonymousId,
            externalId: stored.externalId ?? null,
          }
        } else {
          state = { anonymousId: generateAnonymousId(), externalId: null }
          await persist(state)
        }
      } catch (e) {
        reportError('identity.hydrate failed', e)
        state = { anonymousId: generateAnonymousId(), externalId: null }
      }
      hydrated = true
      return state
    })()
    return hydratingPromise
  }

  return {
    get: (): IdentityState => state,
    hydrate,
    async setExternalId(id: string): Promise<IdentityState> {
      await hydrate()
      const next: IdentityState = { ...state, externalId: id }
      state = next
      await persist(next)
      return next
    },
    async rotate(): Promise<IdentityState> {
      const next: IdentityState = { anonymousId: generateAnonymousId(), externalId: null }
      state = next
      hydrated = true
      await persist(next)
      return next
    },
    async clear(): Promise<IdentityState> {
      const next: IdentityState = { anonymousId: generateAnonymousId(), externalId: null }
      state = next
      hydrated = true
      await persist(next)
      return next
    },
  }
}
