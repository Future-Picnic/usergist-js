// Typed event emitter for public callbacks (onPromptShown/onResponse) and
// internal UI signals (show/dismiss prompts from the matcher to Provider).

import type { ArmedInAppMessage } from '@ritmus/sdk-core'
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
  readonly showSurvey: { readonly surveyId: string; readonly source: string }
  readonly dismissSurvey: { readonly surveyId: string }
  readonly surveyInvite: {
    readonly surveyId: string
    readonly name: string
    readonly source: string
  }
  readonly showInAppMessage: ShowInAppMessagePayload
  readonly pushEvent: PushEventPayload
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
// launch before <RitmusProvider>'s useEffect mounts and the prompt would
// be silently lost. Other events (response, promptShown) don't need
// buffering — they're observational only.
const BUFFERED_EVENTS: ReadonlyArray<EventName> = [
  'showPrompt',
  'showSurvey',
  'surveyInvite',
  'showInAppMessage',
]

export function createEventBus(): EventBus {
  const listeners = new Map<EventName, Set<AnyListener>>()
  const pending = new Map<EventName, unknown>()

  function setFor(name: EventName): Set<AnyListener> {
    let s = listeners.get(name)
    if (!s) {
      s = new Set()
      listeners.set(name, s)
    }
    return s
  }

  return {
    on<K extends EventName>(name: K, cb: Listener<SdkEvents[K]>): () => void {
      const s = setFor(name)
      const wrapped = cb as unknown as AnyListener
      s.add(wrapped)
      // Replay a buffered event to the new subscriber and clear the
      // buffer — first-listener-wins semantics, no double-delivery.
      const buffered = pending.get(name)
      if (buffered !== undefined && BUFFERED_EVENTS.includes(name)) {
        pending.delete(name)
        try {
          wrapped(buffered)
        } catch {
          // listener errors must never cross the SDK boundary
        }
      }
      return () => {
        s.delete(wrapped)
      }
    },
    emit<K extends EventName>(name: K, payload: SdkEvents[K]): void {
      const s = listeners.get(name)
      if (!s || s.size === 0) {
        if (BUFFERED_EVENTS.includes(name)) pending.set(name, payload)
        return
      }
      for (const cb of s) {
        try {
          cb(payload as unknown)
        } catch {
          // listener errors must never cross the SDK boundary
        }
      }
    },
  }
}
