import { PresentationGate } from '@usergist/sdk-core/mobile'
// Typed event emitter for public callbacks (onPromptShown/onResponse) and
// internal UI signals (show/dismiss prompts from the matcher to Provider).

import type { ArmedInAppMessage } from '@usergist/sdk-core/mobile'
import type { ShowPromptPayload, ResponseEmission } from './types.js'

export interface ShowInAppMessagePayload {
  readonly messageId: string
  readonly message: ArmedInAppMessage
  readonly shownAt: number
  readonly triggerEventName: string
}

export interface PushEventPayload {
  /** $push_received | $push_displayed | $push_opened | $push_dismissed | $push_action_clicked */
  readonly name: string
  readonly props: Readonly<Record<string, unknown>>
}

export interface SdkEvents {
  readonly promptShown: ShowPromptPayload
  readonly response: ResponseEmission
  readonly showPrompt: ShowPromptPayload
  readonly dismissPrompt: { readonly promptId: string }
  readonly showSurvey: {
    readonly surveyId: string
    readonly source: string
    readonly language?: string
    readonly survey?: import('@usergist/sdk-core/mobile').SurveyCampaignWithFlow
    readonly attempt?: import('@usergist/sdk-core/mobile').CreateSurveyAttemptResponse
  }
  readonly dismissSurvey: { readonly surveyId: string }
  readonly surveyInvite: {
    readonly attempt?: import('@usergist/sdk-core/mobile').CreateSurveyAttemptResponse
    readonly survey?: import('@usergist/sdk-core/mobile').SurveyCampaignWithFlow
    readonly surveyId: string
    readonly name: string
    readonly source: string
  }
  readonly showInAppMessage: ShowInAppMessagePayload
  readonly resetSurfaces: undefined
  readonly pushEvent: PushEventPayload
  readonly showRequestsBoard: undefined
  readonly showRequestDetail: { readonly requestId: string }
  readonly dismissRequests: undefined
}

export type EventName = keyof SdkEvents
export type Listener<T> = (payload: T) => void

export interface EventBus {
  readonly on: <K extends EventName>(
    name: K,
    cb: Listener<SdkEvents[K]>,
  ) => () => void
  readonly emit: <K extends EventName>(name: K, payload: SdkEvents[K]) => void
}

type AnyListener = (payload: unknown) => void

// Events that drive UX (showing a prompt / a survey invite) are buffered
// until a listener exists. Without this, the matcher could fire on cold
// launch before <UserGistProvider>'s useEffect mounts and the prompt would
// be silently lost. Other events (response, promptShown) don't need
// buffering — they're observational only.
const BUFFERED_EVENTS: ReadonlyArray<EventName> = [
  'showPrompt',
  'showSurvey',
  'surveyInvite',
  'showInAppMessage',
  'showRequestsBoard',
  'showRequestDetail',
]

export function createEventBus(gate = new PresentationGate()): EventBus {
  const listeners = new Map<EventName, Set<AnyListener>>()
  const pending = new Map<EventName, ReadonlyArray<{ payload: unknown; valid: () => boolean }>>()
  const MAX_BUFFERED_PER_EVENT = 100

  function setFor(name: EventName): Set<AnyListener> {
    let s = listeners.get(name)
    if (!s) {
      s = new Set()
      listeners.set(name, s)
    }
    return s
  }

  const deferred: Array<{ dispatch: () => void; valid: () => boolean }> = []
  gate.subscribe(() => {
    for (let index = deferred.length - 1; index >= 0; index--) {
      if (!deferred[index]!.valid()) deferred.splice(index, 1)
    }
    while (!gate.isPaused && deferred.length) deferred.shift()!.dispatch()
  })

  return {
    on<K extends EventName>(name: K, cb: Listener<SdkEvents[K]>): () => void {
      const s = setFor(name)
      const wrapped = cb as unknown as AnyListener
      s.add(wrapped)
      // Replay a buffered event to the new subscriber and clear the
      // buffer — first-listener-wins semantics, no double-delivery.
      const buffered = pending.get(name)
      if (buffered && BUFFERED_EVENTS.includes(name)) {
        pending.delete(name)
        for (const item of buffered) {
          try {
            if (item.valid()) wrapped(item.payload)
          } catch {
            // listener errors must never cross the SDK boundary
          }
        }
      }
      return () => {
        s.delete(wrapped)
      }
    },
    emit<K extends EventName>(name: K, payload: SdkEvents[K]): void {
      if (name === 'resetSurfaces') { pending.clear(); deferred.length = 0 }
      if (name === 'dismissRequests') {
        pending.delete('showRequestsBoard')
        pending.delete('showRequestDetail')
      }
      const campaign = ['showPrompt', 'showSurvey', 'surveyInvite', 'showInAppMessage'].includes(name)
      const valid = campaign ? gate.validator(name === 'showSurvey' || name === 'surveyInvite' ? 'survey' : 'feedback') : () => true
      const dispatch = () => {
        if (!valid()) return
        const s = listeners.get(name)
        if (!s || s.size === 0) {
          if (BUFFERED_EVENTS.includes(name)) {
            const buffered = pending.get(name) ?? []
            pending.set(name, [...buffered, { payload, valid }].slice(-MAX_BUFFERED_PER_EVENT))
          }
          return
        }
        for (const cb of s) {
          try { cb(payload as unknown) } catch { /* host callbacks are isolated */ }
        }
      }
      if (campaign && gate.isPaused) {
        if (deferred.length < MAX_BUFFERED_PER_EVENT) deferred.push({ dispatch, valid })
      } else dispatch()
    },
  }
}
