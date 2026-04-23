// Bounded, persisted, FIFO event queue.
// Default: 1000 events / 1 MB cap. Oldest dropped on overflow.
// Persistence is fire-and-forget; we never block `track()`.

import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type { QueuedEvent } from './types.js'

const MAX_BYTES = 1_000_000

export interface EventQueue {
  readonly hydrate: () => Promise<void>
  readonly enqueue: (e: QueuedEvent) => void
  readonly peek: (n: number) => ReadonlyArray<QueuedEvent>
  readonly drop: (n: number) => void
  readonly restore: (events: ReadonlyArray<QueuedEvent>) => void
  readonly size: () => number
  readonly clear: () => Promise<void>
  readonly snapshot: () => ReadonlyArray<QueuedEvent>
  readonly onOverflow: (cb: (dropped: number) => void) => () => void
}

export function createEventQueue(
  storage: StorageScope,
  maxSize: number,
): EventQueue {
  let events: ReadonlyArray<QueuedEvent> = []
  let hydrated = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  const overflowListeners = new Set<(dropped: number) => void>()

  function schedulePersist(): void {
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      void persist()
    }, 200)
  }

  async function persist(): Promise<void> {
    try {
      let snapshot = events
      // Byte-size guard: trim head until under MAX_BYTES
      let serialized = JSON.stringify(snapshot)
      if (serialized.length > MAX_BYTES) {
        let lo = 0
        let hi = snapshot.length
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          const candidate = snapshot.slice(mid)
          if (JSON.stringify(candidate).length <= MAX_BYTES) {
            hi = mid
          } else {
            lo = mid + 1
          }
        }
        const dropped = lo
        snapshot = snapshot.slice(dropped)
        events = snapshot
        serialized = JSON.stringify(snapshot)
        notifyOverflow(dropped)
      }
      await storage.setJson(STORAGE_KEYS.queue, snapshot)
      void serialized
    } catch (e) {
      reportError('queue.persist failed', e)
    }
  }

  function notifyOverflow(dropped: number): void {
    if (dropped <= 0) return
    for (const cb of overflowListeners) {
      try {
        cb(dropped)
      } catch (e) {
        reportError('queue overflow listener failed', e)
      }
    }
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      try {
        const stored = await storage.getJson<ReadonlyArray<QueuedEvent>>(
          STORAGE_KEYS.queue,
        )
        if (Array.isArray(stored)) events = stored
      } catch (e) {
        reportError('queue.hydrate failed', e)
      }
      hydrated = true
    },
    enqueue(e: QueuedEvent): void {
      let next = [...events, e]
      if (next.length > maxSize) {
        const dropped = next.length - maxSize
        next = next.slice(dropped)
        notifyOverflow(dropped)
      }
      events = next
      schedulePersist()
    },
    peek(n: number): ReadonlyArray<QueuedEvent> {
      return events.slice(0, n)
    },
    drop(n: number): void {
      if (n <= 0) return
      events = events.slice(n)
      schedulePersist()
    },
    restore(restored: ReadonlyArray<QueuedEvent>): void {
      events = [...restored, ...events]
      if (events.length > maxSize) {
        const dropped = events.length - maxSize
        events = events.slice(dropped)
        notifyOverflow(dropped)
      }
      schedulePersist()
    },
    size: (): number => events.length,
    async clear(): Promise<void> {
      events = []
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      await storage.remove(STORAGE_KEYS.queue)
    },
    snapshot: (): ReadonlyArray<QueuedEvent> => events,
    onOverflow(cb): () => void {
      overflowListeners.add(cb)
      return () => {
        overflowListeners.delete(cb)
      }
    },
  }
}
