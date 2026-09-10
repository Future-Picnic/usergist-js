// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserGist, type UserGistClient } from './client.js'
let clients: UserGistClient[] = []
const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
let calls: Array<{ path: string; body: any; headers: any }>
beforeEach(() => {
  calls = []
  vi.useFakeTimers()
  vi.stubGlobal('BroadcastChannel', undefined)
  vi.stubGlobal('indexedDB', undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname
      calls.push({
        path,
        body: init.body ? JSON.parse(String(init.body)) : null,
        headers: init.headers,
      })
      return ok(
        path === '/v1/sdk/clients'
          ? { clientId: crypto.randomUUID() }
          : path === '/v1/sdk/session'
          ? { subjectToken: 'anonymous-token' }
          : {}
      )
    })
  )
})
afterEach(async () => {
  await Promise.all(clients.map((c) => c.destroy()))
  clients = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
async function client(extra: Record<string, unknown> = {}) {
  const c = createUserGist()
  clients.push(c)
  await c.init({
    writeKey: 'ug_test_key',
    apiUrl: 'https://api.example.test',
    ...extra,
  })
  return c
}
describe('explicit browser activation', () => {
  it('initializes without requests, storage, timers or UI', async () => {
    const c = await client({ launcher: { enabled: true, requests: true } })
    c.track('visit')
    await c.setConsent({ feedback: true, analytics: true })
    expect(calls).toEqual([])
    expect(document.querySelector('[data-usergist]')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(await c.startAnonymous()).toBe('rejected')
    expect(c.getSnapshot().state).toBe('inactive')
  })
  it('requires a token and never silently converts an identified user to anonymous', async () => {
    const c = await client()
    expect(await c.identify('customer')).toBe('rejected')
    expect(calls).toEqual([])
    expect(await c.identify('customer', {}, 'signed-token')).toBe('synced')
    expect(await c.identify('other', {}, 'other-token')).toBe('rejected')
    expect(c.getExternalId()).toBe('customer')
    expect(calls.some((c) => c.path === '/v1/sdk/session')).toBe(false)
  })
  it('does not resurrect a session if logout happens during host token retrieval', async () => {
    let resolve!: (value: string) => void
    const c = await client({
      getSubjectToken: () =>
        new Promise<string>((r) => {
          resolve = r
        }),
    })
    const activation = c.identify('customer')
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    await c.reset()
    resolve('late-token')
    expect(await activation).toBe('rejected')
    expect(c.getSnapshot().state).toBe('inactive')
    expect(calls).toEqual([])
  })
  it('explicit anonymous activation and identification preserve the alias', async () => {
    const c = await client({ allowAnonymous: true })
    await c.setConsent({ analytics: true })
    expect(await c.startAnonymous()).toBe('synced')
    const alias = c.getAnonymousId()
    expect(await c.identify('customer', {}, 'signed-token')).toBe('synced')
    expect(c.getAnonymousId()).toBe(alias)
    const identify = calls.find((c) => c.path.endsWith('/identify'))
    expect(identify?.headers['X-UserGist-Client-Id']).toBeUndefined()
  })
  it('logout ends only this client and drops queued work before switching accounts', async () => {
    const c = await client()
    await c.setConsent({ analytics: true })
    await c.identify('customer', {}, 'token')
    c.track('checkout')
    await Promise.resolve()
    await c.reset()
    expect(calls.some((c) => c.path.endsWith('/end'))).toBe(true)
    expect(calls.some((c) => c.path.endsWith('/revoke'))).toBe(false)
    expect(c.getSnapshot()).toMatchObject({
      state: 'inactive',
      queueSize: 0,
      externalId: null,
      anonymousId: null,
    })
    await c.identify('other', {}, 'other-token')
    await c.flush()
    expect(calls.filter((c) => c.path.endsWith('/ingest'))).toEqual([])
  })
  it('retries transient delivery using the same event id and stops when consent is withdrawn', async () => {
    const c = await client()
    await c.setConsent({ analytics: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    let fail = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/ingest') && fail) {
          fail = false
          return new Response('{}', { status: 503 })
        }
        return original(url, init)
      })
    )
    await c.flush()
    expect(c.getSnapshot().queueSize).toBeGreaterThan(0)
    await c.setConsent({ analytics: false })
    expect(c.getSnapshot().queueSize).toBe(0)
    await c.flush()
    expect(calls.filter((c) => c.path.endsWith('/ingest'))).toEqual([])
  })
  it('persists request mutations offline and retries their original idempotency key', async () => {
    const c = await client()
    await c.setConsent({ feedback: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    let pendingBody: any
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/requests')) {
          pendingBody = JSON.parse(String(init.body))
          throw new TypeError('offline')
        }
        return original(url, init)
      })
    )
    const result = await c.submitRequest('Better search', 'Filter by project')
    expect(result).toMatchObject({ queued: true })
    expect(c.getSnapshot().queueSize).toBe(1)
    vi.stubGlobal('fetch', original)
    vi.setSystemTime(Date.now() + 5001)
    await c.flush()
    expect(
      calls.find((c) => c.path.endsWith('/requests'))?.body.idempotencyKey
    ).toBe(pendingBody.idempotencyKey)
    expect(c.getSnapshot().queueSize).toBe(0)
  })
})

describe('web delivery regressions', () => {
  it('drains a trigger queued during an in-flight tick without waiting five seconds', async () => {
    const c = await client()
    await c.setConsent({ analytics: true, feedback: true })
    await c.identify('customer', {}, 'token')
    await c.flush()
    const original = fetch
    let release!: () => void
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/ingest') && JSON.parse(String(init.body)).events[0].name === 'first') {
        await new Promise<void>((resolve) => { release = resolve })
      }
      return original(url, init)
    }))
    c.track('first')
    await (c as any).writes
    const tick = (c as any).tick()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    c.track('show_feedback')
    await (c as any).writes
    // The immediate tick joins the existing flush while its first request waits.
    const nextTick = (c as any).tick()
    const started = Date.now()
    release()
    await Promise.all([tick, nextTick])
    expect(Date.now()).toBe(started)
    expect(calls.filter((call) => call.path.endsWith('/ingest'))
      .flatMap((call) => call.body.events.map((event: any) => event.name))
      .filter((name) => name === 'first' || name === 'show_feedback'))
      .toEqual(['first', 'show_feedback'])
    expect(c.getSnapshot().queueSize).toBe(0)
  })

  it('binds anonymous queued delivery to the identified client without changing the event', async () => {
    const c = await client({ allowAnonymous: true })
    await c.setConsent({ analytics: true })
    await c.startAnonymous()
    const oldClient = c.getSnapshot().clientId
    c.track('offline-watch', { show_id: '00123' })
    await (c as any).writes
    const original = structuredClone((c as any).queue.find((w: any) =>
      w.body?.events?.some((e: any) => e.name === 'offline-watch'),
    ).body)
    await c.identify('movie-viewer', {}, 'identified-token')
    expect(c.getSnapshot().clientId).not.toBe(oldClient)
    await c.flush()
    const sent = calls.find(call => call.path.endsWith('/ingest') &&
      call.body.events.some((event: any) => event.name === 'offline-watch'))!.body
    expect(sent.events).toEqual(original.events)
    expect(sent.delivery.clientId).toBe(c.getSnapshot().clientId)
    expect(c.getSnapshot().queueSize).toBe(0)
  })

  it('rebinds immediate delivery when an ingest retry refreshes authentication', async () => {
    const c = await client({ getSubjectToken: async () => 'refreshed-token' })
    await c.setConsent({ analytics: true })
    await c.identify('viewer', {}, 'initial-token')
    await c.flush()
    const originalFetch = fetch
    const sent: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/ingest')) {
        const body = JSON.parse(String(init.body))
        sent.push(body)
        if (sent.length === 1) return new Response('{}', { status: 401 })
        expect(body.delivery.clientId).toBe(new Headers(init.headers).get('X-UserGist-Client-Id'))
      }
      return originalFetch(url, init)
    }))
    c.track('refresh-watch', { show_id: '00123' })
    await c.flush()
    expect(sent).toHaveLength(2)
    expect(sent[1].events).toEqual(sent[0].events)
    expect(sent[1].delivery.clientId).not.toBe(sent[0].delivery.clientId)
    expect(c.getSnapshot().queueSize).toBe(0)
  })

  it('retries an older committed vote before sending the newer choice', async () => {
    const c = await client()
    await c.setConsent({ feedback: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    const applied: boolean[] = []
    let loseResponse = true
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/vote')) {
        const vote = JSON.parse(String(init.body)).vote
        applied.push(vote)
        if (loseResponse) {
          loseResponse = false
          throw new TypeError('Response lost after commit')
        }
        return ok({ upvoted: vote })
      }
      return original(url, init)
    }))
    expect(await c.voteOnRequest('request', true)).toMatchObject({ queued: true })
    expect(await c.voteOnRequest('request', false)).toMatchObject({ queued: true })
    expect(applied).toEqual([true])
    vi.setSystemTime(Date.now() + 5001)
    await c.flush()
    expect(applied).toEqual([true, true, false])
    expect(c.getSnapshot().queueSize).toBe(0)
  })

  it('does not send a mutation twice when a flush overlaps its request', async () => {
    const c = await client()
    await c.setConsent({ feedback: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    let resolve!: (response: Response) => void
    let sent = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/vote')) {
        sent++
        return new Promise<Response>((r) => { resolve = r })
      }
      return original(url, init)
    }))
    const mutation = c.voteOnRequest('request', true)
    for (let i = 0; i < 30 && !resolve; i++) await Promise.resolve()
    expect(resolve).toBeTypeOf('function')
    const flush = c.flush()
    resolve(ok({ upvoted: true }))
    expect(await mutation).toEqual({ upvoted: true })
    await flush
    expect(sent).toBe(1)
  })

  it('reports permanent mutation failures and removes them from the queue', async () => {
    const c = await client()
    await c.setConsent({ feedback: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) =>
      url.endsWith('/vote') ? new Response(JSON.stringify({ success: false, error: { message: 'Request closed' } }), { status: 403 }) : original(url, init)))
    await expect(c.voteOnRequest('request', true)).rejects.toThrow('Request closed')
    expect(c.getSnapshot().queueSize).toBe(0)
  })

  it.each(['feedback', 'survey'] as const)('closes only the screen whose %s consent was withdrawn', async (purpose) => {
    const c = await client()
    await c.setConsent({ feedback: true, survey: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/authorize')) return ok({ status: 'authorized', presentationId: 'presentation', content: { questions: [{ id: 'q', type: 'short_text', title: 'Question' }] } })
      if (url.endsWith('/attempts')) return ok({ attemptId: 'attempt', startQuestionId: 'q' })
      return original(url, init)
    }))
    const open = () => purpose === 'feedback' ? c.openFeedback('campaign') : c.openSurvey('campaign')
    expect(await open()).toMatchObject({ status: 'opened' })
    const shadow = document.querySelector('[data-usergist]')!.shadowRoot!
    await c.setConsent({ [purpose === 'feedback' ? 'survey' : 'feedback']: false })
    expect(shadow.querySelector('[role=dialog]')).not.toBeNull()
    await c.setConsent({ feedback: true, survey: true })
    await c.setConsent({ [purpose]: false })
    expect(shadow.querySelector('[role=dialog]')).toBeNull()
  })

  it('pages past rejected instructions and retries a lost authorization with the same key', async () => {
    const c = await client()
    await c.setConsent({ feedback: true })
    await c.identify('customer', {}, 'token')
    const original = fetch
    const cursors: string[] = []
    const keys: string[] = []
    let loseResponse = true
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/instructions')) {
        const after = parsed.searchParams.get('after')!
        cursors.push(after)
        return ok(after === '0' ? {
          instructions: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, type: 'prompt.show', payload: { campaignId: 'consumed' } })), nextCursor: 50,
        } : { instructions: [{ id: 51, type: 'prompt.show', payload: { campaignId: 'eligible' } }], nextCursor: null })
      }
      if (parsed.pathname.endsWith('/authorize')) {
        const body = JSON.parse(String(init.body))
        if (body.campaignId === 'consumed') return ok({ status: 'unavailable' })
        keys.push(body.idempotencyKey)
        if (loseResponse) { loseResponse = false
            throw new TypeError('Response lost') }
        return ok({ status: 'authorized', presentationId: 'presentation', content: { questions: [{ id: 'q', type: 'rating', title: 'Feedback' }] } })
      }
      return original(url, init)
    }))
    const poll = () => (c as unknown as { poll(): Promise<void> }).poll()
    await poll()
    await poll()
    expect(cursors).toEqual(['0', '50', '0', '50'])
    expect(keys).toEqual(['instruction:51', 'instruction:51'])
    expect(document.querySelector('[data-usergist]')!.shadowRoot!.querySelector('[role=dialog]')).not.toBeNull()
  })
})

it('continues a large inbox on the next tick, then revisits earlier work', async () => {
  const c = await client()
  await c.setConsent({ feedback: true })
  await c.identify('customer', {}, 'token')
  const original = fetch
  const cursors: number[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/instructions')) {
      const after = Number(parsed.searchParams.get('after'))
      cursors.push(after)
      return ok({
        instructions: after < 250 ? Array.from({ length: 50 }, (_, i) => ({ id: after + i + 1, type: 'prompt.show', payload: { campaignId: 'blocked' } })) : [],
        nextCursor: after < 250 ? after + 50 : null,
      })
    }
    if (parsed.pathname.endsWith('/authorize')) return ok({ status: 'unavailable' })
    return original(url, init)
  }))
  const poll = () => (c as unknown as { poll(): Promise<void> }).poll()
  await poll()
  expect(cursors).toEqual([0, 50, 100, 150, 200])
  await poll()
  expect(cursors.at(-1)).toBe(250)
  await poll()
  expect(cursors[6]).toBe(0)
})

it('renders a triggered survey from the ingest response without authorization or attempt round trips', async () => {
  const c = await client()
  await c.setConsent({ analytics: true, survey: true })
  await c.identify('immediate-customer', {}, 'token')
  await c.flush()
  c.setPageContext({ screenName: 'Movies' })
  const original = fetch
  const eventBodies: any[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (new URL(url).pathname.endsWith('/ingest')) {
        eventBodies.push(JSON.parse(String(init.body)))
        return ok({
          accepted: 1,
          rejected: 0,
          instructions: [
            {
              id: 99,
              type: 'survey.offer',
              payload: {
                surveyId: 'survey',
                authorized: {
                  status: 'authorized',
                  presentationId: 'prepared-survey',
                  content: {
                    flow: {
                      startQuestionId: 'q1',
                      questions: [
                        {
                          id: 'q1',
                          type: 'rating',
                          title: 'Ready immediately',
                          scale: 5,
                        },
                      ],
                      branches: [],
                    },
                  },
                  attempt: {
                    attemptId: 'attempt',
                    startQuestionId: 'q1',
                    currentQuestionId: 'q1',
                    progressSnapshot: {},
                    resumed: false,
                  },
                },
              },
            },
          ],
        })
      }
      return original(url, init)
    })
  )
  c.track('movie-opened')
  await c.flush()
  expect(eventBodies[0].delivery).toEqual({
    eventIds: [eventBodies[0].events[0].eventId],
    clientId: c.getSnapshot().clientId,
    screenName: 'Movies',
  })
  expect(
    document.querySelector('[data-usergist]')!.shadowRoot!.textContent
  ).toContain('Ready immediately')
  expect(
    calls.filter(
      (v) => v.path.endsWith('/authorize') || v.path.endsWith('/attempts')
    )
  ).toEqual([])
})

it('discards an immediate response delivered after the user withdraws survey consent', async () => {
  const c = await client()
  await c.setConsent({ analytics: true, survey: true })
  await c.identify('late-customer', {}, 'token')
  await c.flush()
  const original = fetch
  let release!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) =>
      new URL(url).pathname.endsWith('/ingest')
        ? new Promise<Response>((resolve) => {
            release = resolve
          })
        : original(url, init)
    )
  )
  c.track('movie-opened')
  const pending = c.flush()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await c.setConsent({ survey: false })
  release(
    ok({
      instructions: [
        {
          id: 99,
          type: 'survey.offer',
          payload: {
            surveyId: 'survey',
            authorized: {
              status: 'authorized',
              presentationId: 'late',
              content: {},
            },
          },
        },
      ],
    })
  )
  await pending
  expect(
    document
      .querySelector('[data-usergist]')
      ?.shadowRoot?.querySelector('[role=dialog]')
  ).toBeFalsy()
})
