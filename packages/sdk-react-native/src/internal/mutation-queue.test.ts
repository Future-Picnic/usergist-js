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
  it('retains the latest typed snapshot while an older PATCH is in flight, including after relaunch', async () => {
    const storage = memoryStorage()
    const queue = createMutationQueue(storage)
    await queue.hydrate()
    const progress = (text: string) => ({ attemptId: 'attempt-a',
      body: { currentQuestionId: 'notes', progressSnapshot: { notes: text } } })
    const inFlightId = await queue.enqueue('survey-progress', 'survey', progress('F'))
    for (const text of ['Fi', 'Fin', 'Final answer']) {
      await queue.enqueue('survey-progress', 'survey', progress(text))
    }
    await queue.remove(inFlightId)
    const restored = createMutationQueue(storage)
    await restored.hydrate()
    expect(restored.size()).toBe(1)
    expect(restored.peek()?.payload).toEqual(progress('Final answer'))
    await restored.enqueue('survey-complete', 'survey', { attemptId: 'attempt-a' })
    await restored.remove(restored.peek()!.id)
    expect(restored.peek()?.kind).toBe('survey-complete')
  })

  it('does not merge progress across attempts or move it across a terminal mutation', async () => {
    const queue = createMutationQueue(memoryStorage())
    await queue.hydrate()
    const first = await queue.enqueue('survey-progress', 'survey', { attemptId: 'a', text: 'old' })
    const other = await queue.enqueue('survey-progress', 'survey', { attemptId: 'b', text: 'other' })
    const terminal = await queue.enqueue('survey-complete', 'survey', { attemptId: 'a' })
    const late = await queue.enqueue('survey-progress', 'survey', { attemptId: 'a', text: 'late' })
    expect(queue.size()).toBe(4)
    for (const id of [first, other, terminal, late]) {
      expect(queue.peek()?.id).toBe(id)
      await queue.remove(id)
    }
  })

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

  it('rolls back in-memory state when durable persistence fails', async () => {
    const storage = memoryStorage()
    storage.setJsonStrict = async () => { throw new Error('disk-full') }
    const queue = createMutationQueue(storage)
    await queue.hydrate()

    await expect(
      queue.enqueue('feedback-response', 'feedback', { promptId: 'prompt-a' }),
    ).rejects.toThrow('disk-full')
    expect(queue.size()).toBe(0)
  })
})
