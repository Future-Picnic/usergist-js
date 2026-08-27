import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransport, PermanentHttpError } from './transport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transport retry classification', () => {
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
})
