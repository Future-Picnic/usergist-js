interface Cleanup { id: string; token: string; anonymousId: string }
interface Config { writeKey: string; apiUrl: string }
const memory = new Map<string, Cleanup[]>()
const drains = new Map<string, Promise<void>>()
function read(key: string): Cleanup[] {
  try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? memory.get(key) ?? [] } catch { return memory.get(key) ?? [] }
}
function write(key: string, entries: Cleanup[]) {
  memory.set(key, entries)
  try { sessionStorage.setItem(key, JSON.stringify(entries)) } catch {}
}
export function rememberRevocation(key: string, token: string, anonymousId: string) {
  write(key, [...read(key), { id: crypto.randomUUID(), token, anonymousId }])
}
/** Browser cleanup is scoped to this tab's session storage. No subject token
 * is copied into localStorage or IndexedDB. New account calls use another fetch. */
export function drainRevocations(key: string, config: Config): Promise<void> {
  const pending = drains.get(key)
  if (pending) return pending
  const run = (async () => {
    for (const entry of read(key)) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch(`${config.apiUrl}/v1/sdk/session/revoke`, {
          method: 'POST', credentials: 'omit', keepalive: true, signal: controller.signal,
          headers: { Authorization: `Bearer ${config.writeKey}`, 'Content-Type': 'application/json', 'X-UserGist-Subject-Token': entry.token },
          body: JSON.stringify({ anonymousId: entry.anonymousId }),
        })
        if (!response.ok && response.status !== 401) return
        write(key, read(key).filter(item => item.id !== entry.id))
      } catch { return } finally { clearTimeout(timeout) }
    }
  })().finally(() => { if (drains.get(key) === run) drains.delete(key) })
  drains.set(key, run)
  return run
}
