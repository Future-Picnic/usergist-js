import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransport, PermanentHttpError } from './transport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transport retry classification', () => {
  it('does not advertise JSON for empty survey-abandon requests', async () => {
    const requests: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      requests.push(init)
      // Fastify rejects an empty body when Content-Type declares JSON.
      if (init.body == null && new Headers(init.headers).has('Content-Type')) {
        return new Response('{}', { status: 400 })
      }
      return new Response('{"ok":true}', { status: 200 })
    }))
    const transport = createTransport({ writeKey: 'rk_dev_test', apiUrl: 'https://api.example.test' })
    transport.setSubjectToken('st_test')
    await expect(transport.surveyAbandon('attempt-a')).resolves.toEqual({ ok: true })
    await transport.surveyComplete('attempt-b', { finalAnswers: [] })
    expect(requests).toHaveLength(2)
    expect(new Headers(requests[0]!.headers).has('Content-Type')).toBe(false)
    expect(new Headers(requests[1]!.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(requests[1]!.body))).toEqual({ finalAnswers: [] })
  })

  it('omits prepared attempts when the host controls survey invitations', async () => {
    const capabilities: string[] = []
    let prepare = false
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      capabilities.push(new Headers(init.headers).get('X-UserGist-Capabilities')!)
      return new Response(JSON.stringify({ instructions: [] }), { status: 200 })
    }))
    const transport = createTransport({
      writeKey: 'rk_dev_test',
      apiUrl: 'https://api.example.test',
      prepareSurveys: () => prepare,
    })
    transport.setSubjectToken('st_test')
    await transport.instructions(0)
    prepare = true
    await transport.instructions(0)
    expect(capabilities[0]).not.toContain('survey.attempt.v1')
    expect(capabilities[1]).toContain('survey.attempt.v1')
  })

  it('does not retry a permanent 4xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createTransport({ writeKey: 'rk_dev_test', apiUrl: 'https://api.example.test' })
    transport.setSubjectToken('st_test')

    await expect(transport.ingest({
      context: {
        anonymousId: 'anonymous-a',
        externalId: null,
        sdkVersion: '0.1.0',
        platform: 'react-native',
      },
      events: [{
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'test',
        timestamp: new Date().toISOString(),
        anonymousId: 'anonymous-a',
      }],
    })).rejects.toBeInstanceOf(PermanentHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses an identify credential without exposing it to concurrent requests', async () => {
    let resolveIdentify: ((value: Response) => void) | undefined
    const identifyResponse = new Promise<Response>((resolve) => {
      resolveIdentify = resolve
    })
    const seen = new Map<string, string | null>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const headers = new Headers(init?.headers)
      seen.set(path, headers.get('X-UserGist-Subject-Token'))
      if (path === '/v1/sdk/identify') return identifyResponse
      return new Response('{"ok":true}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const transport = createTransport({ writeKey: 'rk_dev_test', apiUrl: 'https://api.example.test' })
    transport.setSubjectToken('st_anonymous')

    const identify = transport.identify(
      { anonymousId: 'anonymous-a', externalId: 'user-a' },
      'st_identified',
    )
    await transport.consent({
      anonymousId: 'anonymous-a',
      externalId: null,
      purposes: { analytics: true, feedback: true, push: false, survey: false },
      version: 1,
      effectiveAt: new Date().toISOString(),
    })
    resolveIdentify?.(new Response('{"ok":true}', { status: 200 }))
    await identify

    expect(seen.get('/v1/sdk/identify')).toBe('st_identified')
    expect(seen.get('/v1/sdk/consent')).toBe('st_anonymous')
  })
  it('negotiates coordinated delivery with native identity and platform', async () => {
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({success:true,data:{instructions:[]}}),{status:200}))
    vi.stubGlobal('fetch',fetchMock)
    const transport=createTransport({writeKey:'rk_dev_test',apiUrl:'https://api.example.test'})
    transport.setSubjectToken('st_test')
    await transport.instructions(42,{anonymousId:'native-alias',platform:'ios',sdkVersion:'0.1.0'})
    const input=(fetchMock.mock.calls as unknown as Array<[string]>)[0]![0]
    const url=new URL(input)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({after:'42',protocolVersion:'2',anonymousId:'native-alias',platform:'ios'})
  })

})
