import { generateEventId } from './identity.js'
import { STORAGE_KEYS, type StorageScope } from './storage.js'
import { reportError } from './debug.js'

export type MutationPurpose = 'essential' | 'feedback' | 'survey'
export type MutationKind =
  | 'identify'
  | 'feedback-response'
  | 'survey-complete'
  | 'survey-abandon'

export interface PendingMutation {
  readonly id: string
  readonly kind: MutationKind
  readonly purpose: MutationPurpose
  readonly payload: Readonly<Record<string, unknown>>
  readonly createdAt: string
  readonly dedupeKey?: string
}

interface PersistedMutations {
  readonly version: 1
  readonly items: ReadonlyArray<PendingMutation>
}

export interface MutationQueue {
  readonly hydrate: () => Promise<void>
  readonly enqueue: (
    kind: MutationKind,
    purpose: MutationPurpose,
    payload: Readonly<Record<string, unknown>>,
    dedupeKey?: string,
  ) => Promise<string>
  readonly peek: () => PendingMutation | null
  readonly remove: (id: string) => Promise<void>
  readonly removePurpose: (purpose: MutationPurpose) => Promise<void>
  readonly has: (id: string) => boolean
  readonly clear: () => Promise<void>
  readonly size: () => number
}

export function createMutationQueue(storage: StorageScope): MutationQueue {
  let items: ReadonlyArray<PendingMutation> = []
  let hydrated = false
  let serial: Promise<void> = Promise.resolve()

  function mutate(fn: () => void): Promise<void> {
    const next = serial.then(async () => {
      const previous = items
      try {
        fn()
        await storage.setJsonStrict<PersistedMutations>(STORAGE_KEYS.mutationQueue, {
          version: 1,
          items,
        })
      } catch (error) {
        items = previous
        throw error
      }
    })
    serial = next.catch((error) => {
      reportError('mutation queue persistence failed', error)
    })
    return next
  }

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return
      const stored = await storage.getJson<PersistedMutations>(STORAGE_KEYS.mutationQueue)
      if (stored?.version === 1 && Array.isArray(stored.items)) items = stored.items
      hydrated = true
    },
    async enqueue(kind, purpose, payload, dedupeKey): Promise<string> {
      let id = generateEventId()
      await mutate(() => {
        const existing = dedupeKey
          ? items.find((item) => item.dedupeKey === dedupeKey)
          : undefined
        if (existing) {
          id = existing.id
          return
        }
        const next = { id, kind, purpose, payload, createdAt: new Date().toISOString(), dedupeKey }
        items = purpose === 'essential' ? [next, ...items] : [...items, next]
      })
      return id
    },
    peek: () => items[0] ?? null,
    async remove(id): Promise<void> {
      await mutate(() => { items = items.filter((item) => item.id !== id) })
    },
    async removePurpose(purpose): Promise<void> {
      await mutate(() => { items = items.filter((item) => item.purpose !== purpose) })
    },
    has: (id): boolean => items.some((item) => item.id === id),
    async clear(): Promise<void> {
      await mutate(() => { items = [] })
    },
    size: () => items.length,
  }
}
