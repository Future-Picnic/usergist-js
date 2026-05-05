// HTTPS transport with retry + exponential backoff + jitter.
//
// We do NOT gzip in JS for v0 — RN does not ship zlib. This is noted in the
// README as a deferred improvement that will move to a tiny native module.
//
// Cancelable: `reset()` aborts all inflight requests via AbortController.
// Circuit breaker: opens temporarily on a 429/5xx streak of 5.

import type {
  CompleteSurveyAttemptRequest,
  CreateSurveyAttemptRequest,
  CreateSurveyAttemptResponse,
  IngestBatch,
  ResolveSurveyLinkRequest,
  ResolveSurveyLinkResponse,
  SdkArmedInAppMessagesResponse,
  SdkArmedSurveysResponse,
  SdkArmedTriggersResponse,
  SdkConsentPayload,
  SdkIdentifyPayload,
  SdkIngestResponse,
  SubmitResponsePayload,
  SubmitSurveyAnswersRequest,
  SurveyCampaignWithFlow,
  SurveySummary,
  UpdateSurveyAttemptProgressRequest,
  Request as RequestDto,
  RequestSearchResult as RequestSearchResultDto,
  RequestVote as RequestVoteDto,
  RequestFollow as RequestFollowDto,
  RequestComment as RequestCommentDto,
  GetRequestsResult as RequestsListResponse,
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

export interface PushRegisterTokenPayload {
  readonly anonymousId: string
  readonly externalId?: string | null
  readonly token: string
  readonly platform: 'ios' | 'android'
  readonly environment: 'production' | 'sandbox'
  readonly language?: string
  readonly timezone?: string
  readonly appVersion?: string
  readonly sdkVersion?: string
  readonly optIn?: boolean
}

export interface PushInvalidateTokenPayload {
  readonly anonymousId: string
  readonly token: string
}

export interface PushRebindPayload {
  readonly anonymousId: string
  readonly externalId: string
  readonly token: string
}

export interface PushDeliveryBeaconPayload {
  readonly deliveryId: string
  readonly occurredAt?: string
  readonly attemptId?: string
  readonly actionButton?: string
}

export interface PushSilentAckPayload {
  readonly pingId: string
  readonly anonymousId: string
  readonly receivedAt?: string
}

export interface PushAppOpenPayload {
  readonly anonymousId: string
  readonly occurredAt?: string
}

export interface PushChannelSubscriptionPayload {
  readonly anonymousId: string
  readonly channelId: string
  readonly subscribed: boolean
}

export interface Transport {
  readonly ingest: (batch: IngestBatch) => Promise<SdkIngestResponse>
  readonly armedTriggers: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<SdkArmedTriggersResponse>
  readonly armedSurveys: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<SdkArmedSurveysResponse>
  readonly armedInAppMessages: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<SdkArmedInAppMessagesResponse>
  readonly consent: (p: SdkConsentPayload) => Promise<{ ok: true }>
  readonly identify: (p: SdkIdentifyPayload) => Promise<{ ok: true }>
  readonly submitResponse: (p: SubmitResponsePayload) => Promise<{ ok: true }>
  readonly pushRegisterToken: (p: PushRegisterTokenPayload) => Promise<unknown>
  readonly pushInvalidateToken: (p: PushInvalidateTokenPayload) => Promise<unknown>
  readonly pushRebind: (p: PushRebindPayload) => Promise<unknown>
  readonly pushDelivered: (p: PushDeliveryBeaconPayload) => Promise<unknown>
  readonly pushDisplayed: (p: PushDeliveryBeaconPayload) => Promise<unknown>
  readonly pushDismissed: (p: PushDeliveryBeaconPayload) => Promise<unknown>
  readonly pushSilentAck: (p: PushSilentAckPayload) => Promise<unknown>
  readonly pushAppOpen: (p: PushAppOpenPayload) => Promise<unknown>
  readonly pushChannelSubscription: (p: PushChannelSubscriptionPayload) => Promise<unknown>
  readonly pushChannelsList: () => Promise<{ channels: ReadonlyArray<unknown> }>
  readonly surveysAvailable: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<{ surveys: ReadonlyArray<SurveySummary> }>
  readonly surveyGet: (p: {
    readonly surveyId: string
    readonly anonymousId: string
    readonly externalId: string | null
    readonly language?: string
  }) => Promise<SurveyCampaignWithFlow>
  readonly surveyCreateAttempt: (
    surveyId: string,
    body: CreateSurveyAttemptRequest,
  ) => Promise<CreateSurveyAttemptResponse>
  readonly surveyUpdateProgress: (
    attemptId: string,
    body: UpdateSurveyAttemptProgressRequest,
  ) => Promise<{ ok: true }>
  readonly surveySubmitAnswers: (
    attemptId: string,
    body: SubmitSurveyAnswersRequest,
  ) => Promise<{ ok: true }>
  readonly surveyComplete: (
    attemptId: string,
    body: CompleteSurveyAttemptRequest,
  ) => Promise<{ ok: true }>
  readonly surveyAbandon: (attemptId: string) => Promise<{ ok: true }>
  readonly surveyResolveLink: (body: ResolveSurveyLinkRequest) => Promise<ResolveSurveyLinkResponse>
  // ---------- feature requests (5th pillar) ----------
  readonly requestBranding: () => Promise<{
    readonly entryLabel: string
    readonly accentColor: string | null
    readonly logoUrl: string | null
    readonly introCopy: string | null
  }>
  readonly requestsList: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
    readonly sort?: string
    readonly statuses?: ReadonlyArray<string>
    readonly mine?: string
    readonly q?: string
    readonly cursor?: string | null
    readonly limit?: number
  }) => Promise<RequestsListResponse>
  readonly requestsSearch: (p: {
    readonly q: string
    readonly anonymousId: string
    readonly externalId: string | null
    readonly limit?: number
  }) => Promise<{ results: ReadonlyArray<RequestSearchResultDto> }>
  readonly requestGet: (p: {
    readonly requestId: string
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<RequestDto>
  readonly requestSubmit: (p: {
    readonly anonymousId: string
    readonly externalId: string | null
    readonly title: string
    readonly description: string
  }) => Promise<RequestDto>
  readonly requestVote: (p: {
    readonly requestId: string
    readonly anonymousId: string
    readonly externalId: string | null
    readonly vote: boolean
  }) => Promise<RequestVoteDto>
  readonly requestFollow: (p: {
    readonly requestId: string
    readonly anonymousId: string
    readonly externalId: string | null
    readonly follow: boolean
  }) => Promise<RequestFollowDto>
  readonly requestCommentsList: (p: {
    readonly requestId: string
    readonly anonymousId: string
    readonly externalId: string | null
  }) => Promise<{ items: ReadonlyArray<RequestCommentDto> }>
  readonly requestCommentPost: (p: {
    readonly requestId: string
    readonly anonymousId: string
    readonly externalId: string | null
    readonly body: string
  }) => Promise<RequestCommentDto>
  readonly requestCommentEdit: (p: {
    readonly requestId: string
    readonly commentId: string
    readonly anonymousId: string
    readonly body: string
  }) => Promise<RequestCommentDto>
  readonly requestCommentDelete: (p: {
    readonly requestId: string
    readonly commentId: string
    readonly anonymousId: string
  }) => Promise<{ ok: true }>
  readonly cancelAll: () => void
}

interface RequestOpts {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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
        debugLog('http →', { method: opts.method, path: opts.path, attempt })
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
        debugLog('http ←', {
          method: opts.method,
          path: opts.path,
          status: res.status,
          attempt,
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
    armedSurveys: async ({ anonymousId, externalId }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      return request<SdkArmedSurveysResponse>({
        method: 'GET',
        path: `/v1/sdk/armed-surveys?${params.toString()}`,
        idempotent: true,
      })
    },
    armedInAppMessages: async ({ anonymousId, externalId }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      return request<SdkArmedInAppMessagesResponse>({
        method: 'GET',
        path: `/v1/sdk/armed-inapp-messages?${params.toString()}`,
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
    pushRegisterToken: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/register-token',
        body: p,
        idempotent: true,
      }),
    pushInvalidateToken: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/invalidate-token',
        body: p,
        idempotent: true,
      }),
    pushRebind: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/rebind',
        body: p,
        idempotent: true,
      }),
    pushDelivered: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/delivered',
        body: p,
        idempotent: true,
      }),
    pushDisplayed: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/displayed',
        body: p,
        idempotent: true,
      }),
    pushDismissed: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/dismissed',
        body: p,
        idempotent: true,
      }),
    pushSilentAck: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/silent-ack',
        body: p,
        idempotent: true,
      }),
    pushAppOpen: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/app-open',
        body: p,
        idempotent: true,
      }),
    pushChannelSubscription: (p) =>
      request<unknown>({
        method: 'POST',
        path: '/v1/sdk/push/channels/subscription',
        body: p,
        idempotent: true,
      }),
    pushChannelsList: () =>
      request<{ channels: ReadonlyArray<unknown> }>({
        method: 'GET',
        path: '/v1/sdk/push/channels',
        idempotent: true,
      }),
    surveysAvailable: ({ anonymousId, externalId }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      return request<{ surveys: ReadonlyArray<SurveySummary> }>({
        method: 'GET',
        path: `/v1/sdk/surveys/available?${params.toString()}`,
        idempotent: true,
      })
    },
    surveyGet: ({ surveyId, anonymousId, externalId, language }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      if (language) params.append('language', language)
      return request<SurveyCampaignWithFlow>({
        method: 'GET',
        path: `/v1/sdk/surveys/${surveyId}?${params.toString()}`,
        idempotent: true,
      })
    },
    surveyCreateAttempt: (surveyId, body) =>
      request<CreateSurveyAttemptResponse>({
        method: 'POST',
        path: `/v1/sdk/surveys/${surveyId}/attempts`,
        body,
        idempotent: true,
      }),
    surveyUpdateProgress: (attemptId, body) =>
      request<{ ok: true }>({
        method: 'PATCH',
        path: `/v1/sdk/surveys/attempts/${attemptId}`,
        body,
        idempotent: true,
      }),
    surveySubmitAnswers: (attemptId, body) =>
      request<{ ok: true }>({
        method: 'POST',
        path: `/v1/sdk/surveys/attempts/${attemptId}/responses`,
        body,
        idempotent: true,
      }),
    surveyComplete: (attemptId, body) =>
      request<{ ok: true }>({
        method: 'POST',
        path: `/v1/sdk/surveys/attempts/${attemptId}/complete`,
        body,
        idempotent: true,
      }),
    surveyAbandon: (attemptId) =>
      request<{ ok: true }>({
        method: 'POST',
        path: `/v1/sdk/surveys/attempts/${attemptId}/abandon`,
        idempotent: true,
      }),
    surveyResolveLink: (body) =>
      request<ResolveSurveyLinkResponse>({
        method: 'POST',
        path: '/v1/sdk/surveys/resolve-link',
        body,
        idempotent: true,
      }),
    // ---------- feature requests ----------
    requestBranding: () =>
      request<{
        entryLabel: string
        accentColor: string | null
        logoUrl: string | null
        introCopy: string | null
      }>({
        method: 'GET',
        path: '/v1/sdk/request-branding',
        idempotent: true,
      }),
    requestsList: ({ anonymousId, externalId, sort, statuses, mine, q, cursor, limit }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      if (sort) params.append('sort', sort)
      if (statuses) for (const s of statuses) params.append('statuses', s)
      if (mine) params.append('mine', mine)
      if (q) params.append('q', q)
      if (cursor) params.append('cursor', cursor)
      if (limit !== undefined) params.append('limit', String(limit))
      return request<RequestsListResponse>({
        method: 'GET',
        path: `/v1/sdk/requests?${params.toString()}`,
        idempotent: true,
      })
    },
    requestsSearch: ({ q, anonymousId, externalId, limit }) => {
      const params = new URLSearchParams({ q, anonymousId })
      if (externalId) params.append('externalId', externalId)
      if (limit !== undefined) params.append('limit', String(limit))
      return request<{ results: ReadonlyArray<RequestSearchResultDto> }>({
        method: 'GET',
        path: `/v1/sdk/requests/search?${params.toString()}`,
        idempotent: true,
      })
    },
    requestGet: ({ requestId, anonymousId, externalId }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      return request<RequestDto>({
        method: 'GET',
        path: `/v1/sdk/requests/${requestId}?${params.toString()}`,
        idempotent: true,
      })
    },
    requestSubmit: ({ anonymousId, externalId, title, description }) =>
      request<RequestDto>({
        method: 'POST',
        path: '/v1/sdk/requests',
        body: { anonymousId, externalId, title, description },
        idempotent: false,
      }),
    requestVote: ({ requestId, anonymousId, externalId, vote }) =>
      request<RequestVoteDto>({
        method: 'POST',
        path: `/v1/sdk/requests/${requestId}/vote`,
        body: { anonymousId, externalId, vote },
        idempotent: true,
      }),
    requestFollow: ({ requestId, anonymousId, externalId, follow }) =>
      request<RequestFollowDto>({
        method: 'POST',
        path: `/v1/sdk/requests/${requestId}/follow`,
        body: { anonymousId, externalId, follow },
        idempotent: true,
      }),
    requestCommentsList: ({ requestId, anonymousId, externalId }) => {
      const params = new URLSearchParams({ anonymousId })
      if (externalId) params.append('externalId', externalId)
      return request<{ items: ReadonlyArray<RequestCommentDto> }>({
        method: 'GET',
        path: `/v1/sdk/requests/${requestId}/comments?${params.toString()}`,
        idempotent: true,
      })
    },
    requestCommentPost: ({ requestId, anonymousId, externalId, body }) =>
      request<RequestCommentDto>({
        method: 'POST',
        path: `/v1/sdk/requests/${requestId}/comments`,
        body: { anonymousId, externalId, body },
        idempotent: false,
      }),
    requestCommentEdit: ({ requestId, commentId, anonymousId, body }) =>
      request<RequestCommentDto>({
        method: 'PATCH',
        path: `/v1/sdk/requests/${requestId}/comments/${commentId}`,
        body: { anonymousId, body },
        idempotent: true,
      }),
    requestCommentDelete: ({ requestId, commentId, anonymousId }) => {
      const params = new URLSearchParams({ anonymousId })
      return request<{ ok: true }>({
        method: 'DELETE',
        path: `/v1/sdk/requests/${requestId}/comments/${commentId}?${params.toString()}`,
        idempotent: true,
      })
    },
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
