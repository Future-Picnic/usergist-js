import { describe, expect, it, vi } from 'vitest'
import { createEventQueue } from './queue.js'
import type { StorageScope } from './storage.js'
import type { QueuedEvent } from './types.js'

function event(id: string, payload = 'small'): QueuedEvent {
  return {
    eventId: id,
    name: 'test_event',
    timestamp: '2026-08-17T00:00:00.000Z',
    anonymousId: 'anonymous-test',
    externalId: null,
    properties: { payload },
    purpose: 'analytics',
  }
}

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

describe('event queue', () => {
  it('keeps FIFO order and drops the oldest event at the count cap', async () => {
    const queue = createEventQueue(memoryStorage(), 2)
    await queue.hydrate()
    const overflow = vi.fn()
    queue.onOverflow(overflow)
    queue.enqueue(event('a'))
    queue.enqueue(event('b'))
    queue.enqueue(event('c'))
    expect(queue.snapshot().map((item) => item.eventId)).toEqual(['b', 'c'])
    expect(overflow).toHaveBeenCalledWith(1)
  })

  it('enforces the persisted byte cap before the deferred write', async () => {
    const queue = createEventQueue(memoryStorage(), 1000)
    await queue.hydrate()
    queue.enqueue(event('large-a', 'a'.repeat(600_000)))
    queue.enqueue(event('large-b', 'b'.repeat(600_000)))
    expect(queue.snapshot().map((item) => item.eventId)).toEqual(['large-b'])
  })

  it('returns snapshots that callers cannot mutate', async () => {
    const queue = createEventQueue(memoryStorage(), 5)
    await queue.hydrate()
    queue.enqueue(event('a'))
    const snapshot = queue.snapshot() as QueuedEvent[]
    snapshot.splice(0, 1)
    expect(queue.size()).toBe(1)
  })
})
