/** A per-client namespace; no database is opened before explicit activation. */
export class WebStore {
  private memory = new Map<string, unknown>()
  private database?: Promise<IDBDatabase | null>
  constructor(
    private readonly namespace: string,
    private readonly diagnostic: (message: string) => void
  ) {}
  private open(): Promise<IDBDatabase | null> {
    return (this.database ??= new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          this.diagnostic('Browser storage unavailable; using memory')
          resolve(null)
          return
        }
        const request = indexedDB.open('usergist-web', 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('values'))
            request.result.createObjectStore('values')
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => {
          this.diagnostic('Browser storage unavailable; using memory')
          resolve(null)
        }
        request.onblocked = () => {
          this.diagnostic('Browser storage blocked; using memory')
          resolve(null)
        }
      } catch {
        this.diagnostic('Browser storage unavailable; using memory')
        resolve(null)
      }
    }))
  }
  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.open()
    if (!db) return this.memory.get(key) as T | undefined
    return new Promise((resolve) => {
      try {
        const request = db
          .transaction('values')
          .objectStore('values')
          .get(`${this.namespace}:${key}`)
        request.onsuccess = () => resolve(request.result as T | undefined)
        request.onerror = () => resolve(this.memory.get(key) as T | undefined)
      } catch {
        resolve(this.memory.get(key) as T | undefined)
      }
    })
  }
  async set(key: string, value: unknown): Promise<void> {
    this.memory.set(key, value)
    const db = await this.open()
    if (!db) return
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction('values', 'readwrite')
        tx.objectStore('values').put(value, `${this.namespace}:${key}`)
        tx.oncomplete = () => resolve()
        tx.onerror = () => {
          this.diagnostic('Unable to persist work; retaining it in memory')
          resolve()
        }
        tx.onabort = tx.onerror
      } catch {
        this.diagnostic('Unable to persist work; retaining it in memory')
        resolve()
      }
    })
  }
}
