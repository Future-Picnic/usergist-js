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
})
