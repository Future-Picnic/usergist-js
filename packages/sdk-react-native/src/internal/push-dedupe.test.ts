import { beforeEach, expect, it, vi } from 'vitest'
const saved = vi.hoisted(() => new Map<string, string[]>())
vi.mock('./storage.js', () => ({ createStorageScope: (writeKey: string) => ({ getJson: async (key: string) => saved.get(writeKey + key), setJson: async (key: string, value: string[]) => { saved.set(writeKey + key, value) } }) }))
beforeEach(() => { vi.resetModules(); saved.clear() })

it('deduplicates native, Expo and cold-start opens while allowing distinct actions and lifecycle evidence', async () => {
  const { hydratePushDedupe, acceptPushEvent } = await import('./push-dedupe.js')
  await hydratePushDedupe('wk', 'anonymous')
  expect(acceptPushEvent('opened', 'delivery')).toBe(true)
  expect(acceptPushEvent('opened', 'delivery')).toBe(false)
  expect(acceptPushEvent('opened', 'delivery', 'usergist_action_0')).toBe(true)
  expect(acceptPushEvent('opened', 'delivery', 'usergist_action_0')).toBe(false)
  expect(acceptPushEvent('displayed', 'delivery')).toBe(true)
})

it('persists deduplication across relaunches and separates logout identities', async () => {
  const first = await import('./push-dedupe.js')
  await first.hydratePushDedupe('wk', 'first')
  first.acceptPushEvent('opened', 'delivery')
  await vi.waitFor(() => expect(saved.size).toBe(1))
  vi.resetModules()
  const next = await import('./push-dedupe.js')
  await next.hydratePushDedupe('wk', 'first')
  expect(next.acceptPushEvent('opened', 'delivery')).toBe(false)
  await next.hydratePushDedupe('wk', 'second')
  expect(next.acceptPushEvent('opened', 'delivery')).toBe(true)
})
