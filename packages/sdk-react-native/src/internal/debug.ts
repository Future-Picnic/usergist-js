// Debug + decision trace logger.
//
// Notes:
//  - All logging is gated behind `__DEV__` AND the SDK's `debug` flag.
//  - In production, reportError and logTrace are effectively no-ops so the
//    SDK never prints to the host app's console.
//  - We use `globalThis.console` so a host that nulls `console` doesn't crash
//    anything; calls are wrapped in try/catch.

import type { DecisionTrace } from './types.js'

const __DEV__: boolean =
  typeof (globalThis as { __DEV__?: boolean }).__DEV__ === 'boolean'
    ? (globalThis as { __DEV__?: boolean }).__DEV__ === true
    : false

type DebugState = {
  enabled: boolean
  traces: ReadonlyArray<DecisionTrace>
}

let state: DebugState = { enabled: false, traces: [] }

const TRACE_CAP = 200

export function setDebugEnabled(enabled: boolean): void {
  state = { ...state, enabled }
}

export function isDebugEnabled(): boolean {
  return state.enabled
}

export function getTraces(): ReadonlyArray<DecisionTrace> {
  return state.traces
}

export function logTrace(trace: DecisionTrace): void {
  const next = [...state.traces, trace]
  const trimmed = next.length > TRACE_CAP ? next.slice(next.length - TRACE_CAP) : next
  state = { ...state, traces: trimmed }
  if (!__DEV__ || !state.enabled) return
  try {
    // eslint-disable-next-line no-console
    globalThis.console?.log?.('[ritmus]', 'trace', trace)
  } catch {
    // swallow
  }
}

export function reportError(message: string, error?: unknown): void {
  if (!__DEV__ || !state.enabled) return
  try {
    // eslint-disable-next-line no-console
    globalThis.console?.warn?.('[ritmus]', message, error)
  } catch {
    // swallow
  }
}

export function debugLog(message: string, detail?: unknown): void {
  if (!__DEV__ || !state.enabled) return
  try {
    // eslint-disable-next-line no-console
    globalThis.console?.log?.('[ritmus]', message, detail ?? '')
  } catch {
    // swallow
  }
}
