// Per-user, per-survey local cache of in-flight attempts.
// Used to surface the "Continue your last survey?" prompt on app resume and to
// keep an attempt recoverable when the network is flaky.

import { createStorageScope, type StorageScope } from './storage.js'
import { reportError } from './debug.js'
import type {
  SurveyAnswerRecord,
  SurveyCampaignWithFlow,
  CreateSurveyAttemptRequest,
} from '@usergist/sdk-core/mobile'

const PENDING_KEY = 'surveys:pending'

export interface PendingAttempt {
  readonly anonymousId?: string
  readonly externalId?: string | null
  readonly survey?: SurveyCampaignWithFlow
  readonly startRequest?: CreateSurveyAttemptRequest
  readonly surveyId: string
  readonly attemptId: string
  readonly startedAt: number
  readonly currentQuestionId: string | null
  readonly snapshot: SurveyAnswerRecord
  readonly language: string | null
}

export interface SurveyStore {
  readonly list: () => Promise<ReadonlyArray<PendingAttempt>>
  readonly upsert: (attempt: PendingAttempt) => Promise<void>
  readonly remove: (attemptId: string) => Promise<void>
  readonly updateProgress: (
    attemptId: string,
    currentQuestionId: string | null,
    snapshot: SurveyAnswerRecord,
  ) => Promise<void>
  readonly findForSurvey: (surveyId: string) => Promise<PendingAttempt | null>
  readonly clear: () => Promise<void>
}

export function createSurveyStore(
  writeKey: string,
  identity?: () => { anonymousId: string; externalId: string | null },
): SurveyStore {
  const scope: StorageScope = createStorageScope(writeKey)

  let serial: Promise<void> = Promise.resolve()
  function mutate(fn: () => Promise<void>): Promise<void> {
    const work = serial.then(fn)
    serial = work.catch(() => undefined)
    return work
  }

  async function read(): Promise<ReadonlyArray<PendingAttempt>> {
    try {
      const arr = await scope.getJson<ReadonlyArray<PendingAttempt>>(PENDING_KEY)
      if (!Array.isArray(arr)) return []
      return arr.filter(isPending)
    } catch (err) {
      reportError('survey-store.list failed', err)
      return []
    }
  }

  async function list(): Promise<ReadonlyArray<PendingAttempt>> {
    await serial
    const all = await read()
    const current = identity?.()
    return current
      ? all.filter(
          (a) =>
            a.anonymousId === current.anonymousId &&
            (a.externalId == null || a.externalId === current.externalId)
        )
      : all
  }
  return {
    list,
    async upsert(attempt: PendingAttempt): Promise<void> {
      return mutate(async () => {
        const existing = await read()
        const filtered = existing.filter((a) => a.attemptId !== attempt.attemptId)
        await scope.setJsonStrict(PENDING_KEY, [...filtered, attempt])
      })
    },
    async remove(attemptId: string): Promise<void> {
      return mutate(async () => {
        const existing = await read()
        const next = existing.filter((a) => a.attemptId !== attemptId)
        await scope.setJsonStrict(PENDING_KEY, next)
      })
    },
    async updateProgress(attemptId, currentQuestionId, snapshot): Promise<void> {
      return mutate(async () => {
        const existing = await read()
        const target = existing.find((attempt) => attempt.attemptId === attemptId)
        if (!target) return
        await scope.setJsonStrict(
          PENDING_KEY,
          existing.map((attempt) =>
            attempt.attemptId === attemptId
              ? { ...attempt, currentQuestionId, snapshot }
              : attempt,
          ),
        )
      })
    },
    async findForSurvey(surveyId: string): Promise<PendingAttempt | null> {
      const all = await list()
      return all.find((a) => a.surveyId === surveyId) ?? null
    },
    async clear(): Promise<void> {
      await mutate(() => scope.setJsonStrict(PENDING_KEY, []))
    },
  }
}

function isPending(v: unknown): v is PendingAttempt {
  if (!v || typeof v !== 'object') return false
  const x = v as Record<string, unknown>
  return (
    typeof x.surveyId === 'string' &&
    typeof x.attemptId === 'string' &&
    typeof x.startedAt === 'number'
  )
}
