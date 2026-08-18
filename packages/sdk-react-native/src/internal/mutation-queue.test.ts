import { describe, expect, it } from 'vitest'
import { createMutationQueue } from './mutation-queue.js'
import type { StorageScope } from './storage.js'

function memoryStorage(): StorageScope {
  const values = new Map<string, unknown>()
  return {
    key: (suffix) => suffix,
    getJson: async <T>(suffix: string) => (values.get(suffix) as T | undefined) ?? null,
    setJson: async (suffix, value) => { values.set(suffix, value) },
    setJsonStrict: async (suffix, value) => { values.set(suffix, value) },
    remove: async (suffix) => { values.delete(suffix) },
    clearAll: async (suffixes) => { suffixes.forEach((suffix) => values.delete(suffix)) },
  }
}

describe('durable mutation queue', () => {
  it('serializes concurrent duplicate submissions into one mutation', async () => {
    const queue = createMutationQueue(memoryStorage())
    await queue.hydrate()
    const ids = await Promise.all([
      queue.enqueue('survey-complete', 'survey', { attemptId: 'attempt-a' }, 'survey:attempt-a'),
      queue.enqueue('survey-complete', 'survey', { attemptId: 'attempt-a' }, 'survey:attempt-a'),
    ])
    expect(ids[0]).toBe(ids[1])
    expect(queue.size()).toBe(1)
  })

  it('hydrates persisted work and removes only the withdrawn purpose', async () => {
    const storage = memoryStorage()
    const first = createMutationQueue(storage)
    await first.hydrate()
    await first.enqueue('feedback-response', 'feedback', { promptId: 'prompt-a' })
    const surveyId = await first.enqueue('survey-complete', 'survey', { attemptId: 'attempt-a' })
    await first.enqueue('survey-abandon', 'survey', { attemptId: 'attempt-b' })

    const restored = createMutationQueue(storage)
    await restored.hydrate()
    expect(restored.size()).toBe(3)
    await restored.removePurpose('feedback')
    expect(restored.size()).toBe(2)
    expect(restored.has(surveyId)).toBe(true)
  })

  it('prioritizes essential identity work ahead of consent-gated submissions', async () => {
    const queue = createMutationQueue(memoryStorage())
    await queue.hydrate()
    await queue.enqueue('feedback-response', 'feedback', { promptId: 'prompt-a' })
    const identityId = await queue.enqueue('identify', 'essential', {
      anonymousId: 'anonymous-a',
      externalId: 'user-a',
      subjectToken: 'st_test',
    })
    expect(queue.peek()?.id).toBe(identityId)
  })
})
