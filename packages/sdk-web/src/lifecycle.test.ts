// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserGist, type UserGistClient } from './client.js'

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
let clients: UserGistClient[]
let calls: Array<{ path: string; body: any; headers: Record<string, string> }>
let handler: ((path: string, body: any) => Promise<Response | undefined>) | undefined
let anonymousRevoked: boolean
let serverConsent: Record<string, boolean>
let serverVersion: number

beforeEach(() => {
  // Leave IndexedDB's setImmediate tasks real; control only SDK timers/clock.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('BroadcastChannel', undefined)
  sessionStorage.clear()
  clients = []; calls = []; handler = undefined
  anonymousRevoked = false; serverConsent = {}; serverVersion = -1
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const body = init.body ? JSON.parse(String(init.body)) : null
    const headers = init.headers as Record<string, string>
    calls.push({ path, body, headers })
    const response = await handler?.(path, body)
    if (response) return response
    if (path === '/v1/sdk/session') {
      // The API revokes the old anonymous token when its alias is identified.
      if (anonymousRevoked && headers['X-UserGist-Subject-Token'] === 'anonymous-token') {
        return new Response(JSON.stringify({ success: false, error: { message: 'Invalid subject token' } }), { status: 401 })
      }
      return ok({ subjectToken: 'anonymous-token' })
    }
    if (path === '/v1/sdk/identify') { anonymousRevoked = true; return ok({}) }
    if (path === '/v1/sdk/clients') return ok({ clientId: crypto.randomUUID() })
    if (path === '/v1/sdk/consent') {
      // Match the API: equal and older versions are acknowledged but ignored.
      if (body.version > serverVersion) {
        serverVersion = body.version
        serverConsent = body.purposes
      }
      return ok({ ok: true })
    }
    if (path === '/v1/sdk/requests') return ok({ items: [], nextCursor: null })
    if (path.endsWith('/comments')) return ok({ items: [] })
    if (path === '/v1/sdk/requests/idea') return ok({ id: 'idea', title: 'Search', description: 'Better search', status: 'planned', upvoteCount: 0 })
    return ok({})
  }))
})
afterEach(async () => {
  await Promise.all(clients.map(client => client.destroy()))
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
async function client() {
  const sdk = createUserGist()
  clients.push(sdk)
  await sdk.init({ writeKey: 'test-public-key', apiUrl: 'https://api.example.test', allowAnonymous: true })
  return sdk
}

describe('identity transitions with durable browser storage', () => {
  it('identifies a customer after an overlapping anonymous activation finishes', async () => {
    const sdk = await client(), entered = deferred(), gate = deferred()
    handler = async path => {
      if (path === '/v1/sdk/session') { entered.resolve(); await gate.promise; return ok({ subjectToken: 'anonymous-token' }) }
    }
    const anonymous = sdk.startAnonymous()
    await entered.promise
    const identified = sdk.identify('customer', {}, 'identified-token')
    gate.resolve()
    expect(await Promise.all([anonymous, identified])).toEqual(['synced', 'synced'])
    expect(sdk.getSnapshot()).toMatchObject({ state: 'active-identified', externalId: 'customer' })
    expect(calls.filter(call => call.path === '/v1/sdk/identify')).toHaveLength(1)
  })

  it('deduplicates activation for the same requested identity', async () => {
    const sdk = await client(), entered = deferred(), gate = deferred()
    handler = async path => {
      if (path === '/v1/sdk/identify') { entered.resolve(); await gate.promise; return ok({}) }
    }
    const first = sdk.identify('customer', {}, 'token')
    await entered.promise
    const second = sdk.identify('customer', {}, 'token')
    expect(second).toBe(first)
    gate.resolve()
    expect(await second).toBe('synced')
    expect(calls.filter(call => call.path === '/v1/sdk/identify')).toHaveLength(1)
  })

  it('cancels queued identification when logout happens during activation', async () => {
    const sdk = await client(), entered = deferred(), gate = deferred()
    handler = async path => {
      if (path === '/v1/sdk/session') { entered.resolve(); await gate.promise; return ok({ subjectToken: 'anonymous-token' }) }
    }
    const anonymous = sdk.startAnonymous()
    await entered.promise
    const identified = sdk.identify('customer', {}, 'token')
    await sdk.reset()
    gate.resolve()
    expect(await Promise.all([anonymous, identified])).toEqual(['rejected', 'rejected'])
    expect(sdk.getSnapshot().state).toBe('inactive')
    expect(calls.some(call => call.path === '/v1/sdk/identify')).toBe(false)
  })

  it('preserves pending work across identification/reload and starts fresh after logout', async () => {
    const sdk = await client()
    await sdk.setConsent({ feedback: true })
    expect(await sdk.startAnonymous()).toBe('synced')
    const previousAlias = sdk.getAnonymousId()
    handler = async path => { if (path === '/v1/sdk/requests') throw new TypeError('offline'); return undefined }
    expect(await sdk.submitRequest('Search', 'Better search')).toMatchObject({ queued: true })
    expect(await sdk.identify('customer', {}, 'token')).toBe('synced')
    expect(sdk.getAnonymousId()).toBe(previousAlias)
    expect(sdk.getSnapshot().queueSize).toBe(1)
    // A new SDK instance models a page reload using the same sessionStorage/IDB.
    const reloaded = await client()
    await reloaded.setConsent({ feedback: true })
    expect(await reloaded.identify('customer', {}, 'token')).toBe('synced')
    expect(reloaded.getSnapshot().queueSize).toBe(1)
    await reloaded.reset()
    expect(await reloaded.startAnonymous()).toBe('synced')
    expect(reloaded.getAnonymousId()).not.toBe(previousAlias)
    expect(reloaded.getSnapshot().queueSize).toBe(0)
    const session = calls.filter(call => call.path === '/v1/sdk/session').at(-1)!
    expect(session.headers['X-UserGist-Subject-Token']).toBeUndefined()
  })

  it('clears the previous anonymous credentials even if registration fails after identification', async () => {
    const sdk = await client()
    await sdk.startAnonymous()
    const previousAlias = sdk.getAnonymousId()
    handler = async path => path === '/v1/sdk/clients' ? new Response('{}', { status: 503 }) : undefined
    expect(await sdk.identify('customer', {}, 'token')).toBe('rejected')
    await sdk.reset()
    handler = undefined
    expect(await sdk.startAnonymous()).toBe('synced')
    expect(sdk.getAnonymousId()).not.toBe(previousAlias)
  })
})

describe('consent changes during browser activity', () => {
  it('does not open the board if feedback consent is withdrawn while branding loads', async () => {
    const sdk = await client(), entered = deferred(), gate = deferred()
    await sdk.setConsent({ feedback: true })
    await sdk.identify('customer', {}, 'token')
    handler = async path => {
      if (path === '/v1/sdk/request-branding') { entered.resolve(); await gate.promise; return ok({ entryLabel: 'Feature requests' }) }
    }
    const opening = sdk.openRequestsBoard()
    await entered.promise
    await sdk.setConsent({ feedback: false })
    gate.resolve()
    expect(await opening).toEqual({ status: 'consent_required' })
    expect(Boolean(document.querySelector('[data-usergist]')?.shadowRoot?.querySelector('[role=dialog]'))).toBe(false)
  })

  it('keeps the same consent guard when navigating back from request details', async () => {
    const sdk = await client(), entered = deferred(), gate = deferred()
    await sdk.setConsent({ feedback: true })
    await sdk.identify('customer', {}, 'token')
    expect(await sdk.openRequestDetail('idea')).toEqual({ status: 'opened' })
    handler = async path => {
      if (path === '/v1/sdk/request-branding') { entered.resolve(); await gate.promise; return ok({ entryLabel: 'Feature requests' }) }
    }
    const shadow = document.querySelector('[data-usergist]')!.shadowRoot!
    Array.from(shadow.querySelectorAll('button')).find(button => button.textContent === 'All requests')!.click()
    await entered.promise
    await sdk.setConsent({ feedback: false })
    gate.resolve()
    // Let the response and UI continuation finish without starting SDK timers.
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(Boolean(shadow.querySelector('[role=dialog]'))).toBe(false)
  })

  it('sends the latest consent even when timestamps tie or the clock moves backwards', async () => {
    const sdk = await client()
    await sdk.identify('customer', {}, 'token')
    await sdk.setConsent({ feedback: true })
    await sdk.setConsent({ feedback: false })
    expect(serverConsent.feedback).toBe(false)
    vi.setSystemTime(Date.now() - 60_000)
    await sdk.setConsent({ feedback: true })
    expect(serverConsent.feedback).toBe(true)
    const versions = calls.filter(call => call.path === '/v1/sdk/consent').map(call => call.body.version)
    expect(versions.every((version, index) => index === 0 || version > versions[index - 1])).toBe(true)
  })
})
