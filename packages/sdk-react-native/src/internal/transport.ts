// HTTPS transport with retry + exponential backoff + jitter.
//
// We do NOT gzip in JS for v0 — RN does not ship zlib. This is noted in the
// README as a deferred improvement that will move to a tiny native module.
//
// Cancelable: `reset()` aborts all inflight requests via AbortController.
// Circuit breaker: opens temporarily on a 429/5xx streak of 5.

import type {
  IngestBatch,
  SdkArmedTriggersResponse,
  SdkConsentPayload,
  SdkIdentifyPayload,
  SdkIngestResponse,
  SubmitResponsePayload,
} from '@ritmus/sdk-core'
import { reportError, debugLog } from './debug.js'

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 16_000
const CIRCUIT_OPEN_MS = 30_000
const CIRCUIT_FAILURE_THRESHOLD = 5

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMExceptionLike('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(() => resolve(), ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(new DOMExceptionLike('Aborted', 'AbortError'))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

class DOMExceptionLike extends Error {
  public readonly name: string
  constructor(message: string, name: string) {
    super(message)
    this.name = name
  }
}

function backoff(attempt: number): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  const jitter = base * 0.2 * (Math.random() * 2 - 1)
  return Math.max(0, base + jitter)
}

export interface TransportConfig {
  readonly writeKey: string
  readonly apiUrl: string
}

export interface Transport {
  readonly ingest: (batch: IngestBatch) => Promise<SdkIngestResponse>
  readonly armedTriggers: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<SdkArmedTriggersResponse>
  readonly consent: (p: SdkConsentPayload) => Promise<{ ok: true }>
  readonly identify: (p: SdkIdentifyPayload) => Promise<{ ok: true }>
  readonly submitResponse: (p: SubmitResponsePayload) => Promise<{ ok: true }>
  readonly cancelAll: () => void
}

interface RequestOpts {
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly body?: unknown
  readonly idempotent: boolean
}

export function createTransport(cfg: TransportConfig): Transport {
  let abortController = new AbortController()
  let consecutiveFailures = 0
  let circuitOpenUntil = 0

  function resetCircuit(): void {
    consecutiveFailures = 0
    circuitOpenUntil = 0
  }

  function recordFailure(status: number): void {
    if (status === 429 || status >= 500) {
      consecutiveFailures += 1
      if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
        circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS
        debugLog('transport circuit opened', { until: circuitOpenUntil })
      }
    }
  }

  function isCircuitOpen(): boolean {
    return Date.now() < circuitOpenUntil
  }

  async function request<T>(opts: RequestOpts): Promise<T> {
    if (isCircuitOpen()) {
      throw new Error('circuit-open')
    }
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}${opts.path}`
    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await fetch(url, {
          method: opts.method,
          headers: {
            Authorization: `Bearer ${cfg.writeKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: opts.body == null ? undefined : JSON.stringify(opts.body),
          signal: abortController.signal,
        })
        if (res.ok) {
          resetCircuit()
          const text = await res.text()
          if (!text) return {} as T
          const parsed = JSON.parse(text) as unknown
          // Unwrap the API envelope `{success, data, error}` if present.
          if (
            parsed &&
            typeof parsed === 'object' &&
            'success' in parsed &&
            (parsed as { success: boolean }).success === true &&
            'data' in parsed
          ) {
            return (parsed as { data: T }).data
          }
          return parsed as T
        }
        // Non-2xx
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          // client error — don't retry
          throw new Error(`http-${res.status}`)
        }
        recordFailure(res.status)
        if (!opts.idempotent) throw new Error(`http-${res.status}`)
        if (attempt >= MAX_ATTEMPTS - 1) throw new Error(`http-${res.status}`)
        await sleep(backoff(attempt), abortController.signal)
        attempt += 1
      } catch (e) {
        const name = (e as { name?: string })?.name
        if (name === 'AbortError') throw e
        if (!opts.idempotent) throw e
        if (attempt >= MAX_ATTEMPTS - 1) throw e
        await sleep(backoff(attempt), abortController.signal)
        attempt += 1
      }
    }
  }

  return {
    ingest: (batch) =>
      request<SdkIngestResponse>({
        method: 'POST',
        path: '/v1/sdk/ingest',
        body: batch,
        idempotent: true,
      }),
    armedTriggers: async ({ anonymousId, externalId }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      return request<SdkArmedTriggersResponse>({
        method: 'GET',
        path: `/v1/sdk/armed-triggers?${params.toString()}`,
        idempotent: true,
      })
    },
    consent: (p) =>
      request<{ ok: true }>({
        method: 'POST',
        path: '/v1/sdk/consent',
        body: p,
        idempotent: true,
      }),
    identify: (p) =>
      request<{ ok: true }>({
        method: 'POST',
        path: '/v1/sdk/identify',
        body: p,
        idempotent: true,
      }),
    submitResponse: (p) =>
      request<{ ok: true }>({
        method: 'POST',
        path: '/v1/sdk/responses',
        body: p,
        idempotent: true,
      }),
    cancelAll(): void {
      try {
        abortController.abort()
      } catch (e) {
        reportError('transport.cancelAll failed', e)
      }
      abortController = new AbortController()
      resetCircuit()
    },
  }
}
