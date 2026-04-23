// App lifecycle manager.
//  - Subscribes to AppState.
//  - On foreground: refresh armed triggers + flush queue.
//  - On background: final flush attempt (best-effort).
//  - While foregrounded: periodically refresh triggers every syncIntervalMs.

import { reportError } from './debug.js'

type AppStateLike = {
  readonly addEventListener: (
    type: 'change',
    handler: (state: string) => void,
    // returns subscription-like
  ) => { remove: () => void } | (() => void)
  readonly currentState?: string
}

declare const require: (id: string) => unknown

function loadAppState(): AppStateLike | null {
  try {
    const rn = require('react-native') as { AppState?: AppStateLike } | undefined
    return rn?.AppState ?? null
  } catch {
    return null
  }
}

export interface LifecycleManager {
  readonly start: () => void
  readonly stop: () => void
  readonly isForeground: () => boolean
}

export function createLifecycleManager(params: {
  readonly onForeground: () => void
  readonly onBackground: () => void
  readonly onSyncTick: () => void
  readonly syncIntervalMs: number
}): LifecycleManager {
  const { onForeground, onBackground, onSyncTick, syncIntervalMs } = params
  let subscription: { remove: () => void } | (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let foreground = true
  let started = false

  function handleChange(next: string): void {
    const wasForeground = foreground
    foreground = next === 'active'
    if (!wasForeground && foreground) {
      try {
        onForeground()
      } catch (e) {
        reportError('lifecycle.onForeground failed', e)
      }
      ensureTimer()
    } else if (wasForeground && !foreground) {
      try {
        onBackground()
      } catch (e) {
        reportError('lifecycle.onBackground failed', e)
      }
      stopTimer()
    }
  }

  function ensureTimer(): void {
    if (timer) return
    timer = setInterval(() => {
      try {
        onSyncTick()
      } catch (e) {
        reportError('lifecycle.onSyncTick failed', e)
      }
    }, syncIntervalMs)
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    start(): void {
      if (started) return
      started = true
      const appState = loadAppState()
      if (appState?.addEventListener) {
        try {
          subscription = appState.addEventListener('change', handleChange)
        } catch (e) {
          reportError('lifecycle.subscribe failed', e)
        }
        foreground = (appState.currentState ?? 'active') === 'active'
      }
      if (foreground) ensureTimer()
    },
    stop(): void {
      started = false
      stopTimer()
      try {
        if (typeof subscription === 'function') subscription()
        else if (subscription && typeof subscription.remove === 'function') subscription.remove()
      } catch (e) {
        reportError('lifecycle.unsubscribe failed', e)
      }
      subscription = null
    },
    isForeground: () => foreground,
  }
}
