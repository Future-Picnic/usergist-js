import type {
  CreateSurveyAttemptResponse,
  SurveyCampaignWithFlow,
} from '@usergist/sdk-core/mobile'
import type { StorageScope } from './storage.js'

interface Identity {
  anonymousId: string
  externalId: string | null
}

export interface SurveyInvitation {
  surveyId: string
  presentationId: string
  source: string
  survey: SurveyCampaignWithFlow
  attempt?: CreateSurveyAttemptResponse
  expiresAt: number
}

type StoredInvitation = SurveyInvitation & Identity
const KEY = 'surveys:invitations'

/** An authorized offer is not an attempt: a custom onInvite handler may choose
 * to open it later. Retain its frozen content until opening, expiry or reset. */
export function createSurveyInvitations(
  storage: StorageScope,
  identity: () => Identity,
) {
  let serial: Promise<void> = Promise.resolve()
  const read = async (): Promise<StoredInvitation[]> => {
    const value = await storage.getJson<StoredInvitation[]>(KEY)
    return Array.isArray(value)
      ? value.filter(
          (entry) =>
            entry &&
            typeof entry.surveyId === 'string' &&
            typeof entry.presentationId === 'string' &&
            entry.survey &&
            entry.expiresAt > Date.now(),
        )
      : []
  }
  const mutate = (fn: () => Promise<void>) => {
    const work = serial.then(fn)
    serial = work.catch(() => undefined)
    return work
  }
  return {
    remember(invitation: SurveyInvitation) {
      const owner = identity()
      return mutate(async () => {
        const existing = await read()
        const previous = existing.find(
          (entry) => entry.presentationId === invitation.presentationId,
        )
        await storage.setJsonStrict(
          KEY,
          [
            ...existing.filter(
              (entry) =>
                entry.surveyId !== invitation.surveyId ||
                entry.anonymousId !== owner.anonymousId ||
                entry.externalId !== owner.externalId,
            ),
            {
              ...invitation,
              ...owner,
              expiresAt: Math.min(
                invitation.expiresAt,
                previous?.expiresAt ?? Infinity,
              ),
            },
          ].slice(-50),
        )
      })
    },
    async find(surveyId: string): Promise<SurveyInvitation | undefined> {
      await serial
      const owner = identity()
      return (await read()).find(
        (entry) =>
          entry.surveyId === surveyId &&
          entry.anonymousId === owner.anonymousId &&
          entry.externalId === owner.externalId,
      )
    },
    remove(presentationId: string) {
      return mutate(async () =>
        storage.setJsonStrict(
          KEY,
          (await read()).filter(
            (entry) => entry.presentationId !== presentationId,
          ),
        ),
      )
    },
    clear() {
      return mutate(() => storage.setJsonStrict(KEY, []))
    },
  }
}

export type SurveyInvitations = ReturnType<typeof createSurveyInvitations>
