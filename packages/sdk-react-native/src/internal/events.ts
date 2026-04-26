// Typed event emitter for public callbacks (onPromptShown/onResponse) and
// internal UI signals (show/dismiss prompts from the matcher to Provider).

import type { ShowPromptPayload, ResponseEmission } from './types.js'

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

export function createEventBus(): EventBus {
  const listeners = new Map<EventName, Set<AnyListener>>()

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
      return () => {
        s.delete(wrapped)
      }
    },
    emit<K extends EventName>(name: K, payload: SdkEvents[K]): void {
      const s = listeners.get(name)
      if (!s) return
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
