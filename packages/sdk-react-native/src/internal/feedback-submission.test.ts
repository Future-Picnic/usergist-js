import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushMutations, submitResponse, type Engine } from './engine.js'
import { createMutationQueue } from './mutation-queue.js'
import type { StorageScope } from './storage.js'
import { createTransport } from './transport.js'

afterEach(() => vi.unstubAllGlobals())

describe('feedback device context', () => {
  it.each(['ios', 'android'] as const)(
    'retains the submitting %s device and app version through an offline retry',
    async (platform) => {
      const values = new Map<string, unknown>()
      const storage = {
        getJson: async (key: string) => values.get(key) ?? null,
        setJsonStrict: async (key: string, value: unknown) => {
          values.set(key, JSON.parse(JSON.stringify(value)))
        },
      } as StorageScope
      const mutations = createMutationQueue(storage)
      await mutations.hydrate()
      const engine = {
        resetting: false,
        resetGeneration: 0,
        mutations,
        mutationFlushPromise: null,
        identity: { get: () => ({ anonymousId: 'native-alias', externalId: null }) },
        context: { build: () => ({ platform, sdkVersion: 'test-sdk', appVersion: '1.2.3' }) },
        consent: { allowsFeedback: () => true, get: () => ({ feedback: true }) },
        events: { emit: vi.fn() },
        transport: { submitResponse: vi.fn(async () => { throw new Error('offline') }) },
      } as unknown as Engine

      await submitResponse(engine, {
        promptId: 'prompt', answers: [{ questionId: 'rating', value: 5 }],
        dismissed: false, latencyMs: 250,
      }, 'feedback_requested', vi.fn())
      await engine.mutationFlushPromise
      const pending = mutations.peek()!
      expect(pending.payload).toMatchObject({ platform, sdkVersion: 'test-sdk', appVersion: '1.2.3' })

      const restored = createMutationQueue(storage)
      await restored.hydrate()
      const fetchMock = vi.fn(async () => new Response('{"success":true,"data":{"ok":true}}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const transport = createTransport({ writeKey: 'rk_dev_test', apiUrl: 'https://api.example.test' })
      transport.setSubjectToken('st_test')
      const restarted = {
        ...engine, mutations: restored, transport,
        context: { build: () => ({ platform, sdkVersion: 'new-sdk', appVersion: '2.0.0' }) },
      } as unknown as Engine
      await flushMutations(restarted)

      expect(restored.size()).toBe(0)
      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0]!
      expect(url).toBe('https://api.example.test/v1/sdk/responses')
      expect(JSON.parse(String(init.body))).toEqual(pending.payload)
    },
  )
})
