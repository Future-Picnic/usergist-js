import { STORAGE_KEYS, type StorageScope } from './storage.js'

const MAX_KEYS = 200

export interface LocalInstructionDedupe {
  readonly hydrate: () => Promise<void>
  readonly remember: (key: string) => void
  readonly consume: (key: string) => boolean
  readonly clear: () => Promise<void>
  readonly size: () => number
  readonly has: (key: string) => boolean
}

/**
 * Persists locally rendered campaign/event pairs until the matching server
 * instruction is consumed. This prevents an app restart between ingest and
 * instruction polling from replaying a prompt, survey, or in-app message.
 */
export function createLocalInstructionDedupe(
  storage: StorageScope,
): LocalInstructionDedupe {
  const keys = new Set<string>()
  let persistence = Promise.resolve()

  function schedulePersist(): void {
    const snapshot = [...keys]
    persistence = persistence.then(() =>
      storage.setJson(STORAGE_KEYS.localInstructionDedupe, snapshot),
    )
  }

  return {
    async hydrate(): Promise<void> {
      const stored = await storage.getJson<ReadonlyArray<unknown>>(
        STORAGE_KEYS.localInstructionDedupe,
      )
      if (!Array.isArray(stored)) return
      keys.clear()
      for (const value of stored.slice(-MAX_KEYS)) {
        if (typeof value === 'string' && value.length > 0) keys.add(value)
      }
    },
    remember(key): void {
      keys.delete(key)
      keys.add(key)
      while (keys.size > MAX_KEYS) {
        const oldest = keys.values().next().value
        if (typeof oldest !== 'string') break
        keys.delete(oldest)
      }
      schedulePersist()
    },
    consume(key): boolean {
      if (!keys.delete(key)) return false
      schedulePersist()
      return true
    },
    async clear(): Promise<void> {
      keys.clear()
      schedulePersist()
      await persistence
    },
    size: () => keys.size,
    has: (key) => keys.has(key),
  }
}
