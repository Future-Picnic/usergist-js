// Bounded, persisted, FIFO event queue.
// Default: 1000 events / 1 MB cap. Oldest dropped on overflow.
// Persistence is fire-and-forget; we never block `track()`.

import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type { QueuedEvent } from './types.js'

const MAX_BYTES = 1_000_000

// Bumped every time the persisted shape changes. Older snapshots from
// previous SDK versions are discarded on hydrate so the SDK never crashes
// on a deserialise mismatch — events are best-effort, not durable contracts.
const QUEUE_SCHEMA_VERSION = 2

interface PersistedQueue {
  readonly version: number
  readonly events: ReadonlyArray<QueuedEvent>
}

function isPersistedQueue(v: unknown): v is PersistedQueue {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { version?: unknown }).version === 'number' &&
    Array.isArray((v as { events?: unknown }).events)
  )
}

export interface EventQueue {
  readonly hydrate: () => Promise<void>
  readonly enqueue: (e: QueuedEvent) => void
  readonly peek: (n: number) => ReadonlyArray<QueuedEvent>
  readonly drop: (n: number) => void
  readonly remove: (eventIds: ReadonlyArray<string>) => void
  readonly removePurpose: (purpose: QueuedEvent['purpose']) => void
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
  let events: QueuedEvent[] = []
  let encodedSizes: number[] = []
  let encodedItemsBytes = 0
  let hydrated = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let persistence: Promise<void> = Promise.resolve()
  const overflowListeners = new Set<(dropped: number) => void>()

  function encodedSize(event: QueuedEvent): number {
    try {
      return JSON.stringify(event).length
    } catch {
      return MAX_BYTES + 1
    }
  }

  function rebuildSizes(): void {
    encodedSizes = events.map(encodedSize)
    encodedItemsBytes = encodedSizes.reduce((total, size) => total + size, 0)
  }

  function currentBytes(): number {
    return 2 + encodedItemsBytes + Math.max(0, events.length - 1)
  }

  function trimOverflow(): number {
    let dropped = 0
    while (events.length > 0 && (events.length > maxSize || currentBytes() > MAX_BYTES)) {
      events.shift()
      encodedItemsBytes -= encodedSizes.shift() ?? 0
      dropped += 1
    }
    notifyOverflow(dropped)
    return dropped
  }

  function schedulePersist(): void {
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistence = persistence.then(persist, persist)
    }, 200)
  }

  async function persist(): Promise<void> {
    try {
      trimOverflow()
      const snapshot = events.slice()
      const wrapped: PersistedQueue = { version: QUEUE_SCHEMA_VERSION, events: snapshot }
      await storage.setJson(STORAGE_KEYS.queue, wrapped)
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
        const stored = await storage.getJson<unknown>(STORAGE_KEYS.queue)
        if (isPersistedQueue(stored)) {
          if (stored.version === QUEUE_SCHEMA_VERSION) {
            events = [...stored.events]
          } else {
            // Unknown / older schema — discard rather than risk a crash on
            // shape mismatch. Events are best-effort, not durable.
            reportError('queue.hydrate: discarding unknown queue version', stored.version)
            await storage.remove(STORAGE_KEYS.queue)
          }
        } else if (Array.isArray(stored)) {
          // Legacy unversioned snapshot from earlier SDK builds. Re-wrap on
          // the next persist() call.
          events = [...stored as ReadonlyArray<QueuedEvent>]
        }
        rebuildSizes()
        if (trimOverflow() > 0) schedulePersist()
      } catch (e) {
        reportError('queue.hydrate failed', e)
      }
      hydrated = true
    },
    enqueue(e: QueuedEvent): void {
      events.push(e)
      const size = encodedSize(e)
      encodedSizes.push(size)
      encodedItemsBytes += size
      trimOverflow()
      schedulePersist()
    },
    peek(n: number): ReadonlyArray<QueuedEvent> {
      return events.slice(0, n)
    },
    drop(n: number): void {
      if (n <= 0) return
      const count = Math.min(n, events.length)
      const removedSizes = encodedSizes.splice(0, count)
      events.splice(0, count)
      encodedItemsBytes -= removedSizes.reduce((total, size) => total + size, 0)
      schedulePersist()
    },
    remove(eventIds: ReadonlyArray<string>): void {
      if (eventIds.length === 0) return
      const ids = new Set(eventIds)
      events = events.filter((event) => !ids.has(event.eventId))
      rebuildSizes()
      schedulePersist()
    },
    removePurpose(purpose: QueuedEvent['purpose']): void {
      events = events.filter((event) => event.purpose !== purpose)
      rebuildSizes()
      schedulePersist()
    },
    restore(restored: ReadonlyArray<QueuedEvent>): void {
      events = [...restored, ...events]
      rebuildSizes()
      trimOverflow()
      schedulePersist()
    },
    size: (): number => events.length,
    async clear(): Promise<void> {
      events = []
      encodedSizes = []
      encodedItemsBytes = 0
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      await persistence
      await storage.remove(STORAGE_KEYS.queue)
    },
    snapshot: (): ReadonlyArray<QueuedEvent> => events.slice(),
    onOverflow(cb): () => void {
      overflowListeners.add(cb)
      return () => {
        overflowListeners.delete(cb)
      }
    },
  }
}
