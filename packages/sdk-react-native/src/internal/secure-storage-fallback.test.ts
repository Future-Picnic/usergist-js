import { describe, expect, it, vi } from 'vitest'
import { guardSecureBackend } from './storage.js'

const memory = () => {
  const map = new Map<string, string>()
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => { map.set(k, v) },
    removeItem: async (k: string) => { map.delete(k) },
  }
}

describe('guardSecureBackend', () => {
  it('keeps values readable in-process when the Keychain refuses (-34018)', async () => {
    const refused = () => Promise.reject(new Error('Keychain write failed: -34018'))
    const native = { getItem: vi.fn(refused), setItem: vi.fn(refused), removeItem: vi.fn(refused) }
    const store = guardSecureBackend(native, memory())
    expect(await store.getItem('identity')).toBeNull()
    await expect(store.setItem('identity', '{"anonymousId":"a"}')).resolves.toBeUndefined()
    expect(await store.getItem('identity')).toBe('{"anonymousId":"a"}')
    await expect(store.setItem('mutationQueue', '{"items":[1]}')).resolves.toBeUndefined()
    expect(store.degraded()).toBe(true)
    expect(native.getItem).toHaveBeenCalledTimes(1)
    expect(native.setItem).not.toHaveBeenCalled()
  })

  it('uses the native store while it works', async () => {
    const backing = memory()
    const store = guardSecureBackend(backing, memory())
    await store.setItem('k', 'v')
    expect(await backing.getItem('k')).toBe('v')
    expect(store.degraded()).toBe(false)
  })
})
