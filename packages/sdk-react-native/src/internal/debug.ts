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
export interface SdkDiagnostic {
  readonly code: 'sdk_error'
  readonly message: string
  readonly occurredAt: string
}

let diagnosticHandler: ((diagnostic: SdkDiagnostic) => void) | null = null

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

export function setDiagnosticHandler(
  handler: ((diagnostic: SdkDiagnostic) => void) | null,
): void {
  diagnosticHandler = handler
}

export function logTrace(trace: DecisionTrace): void {
  const next = [...state.traces, trace]
  const trimmed = next.length > TRACE_CAP ? next.slice(next.length - TRACE_CAP) : next
  state = { ...state, traces: trimmed }
  if (!__DEV__ || !state.enabled) return
  try {
    // eslint-disable-next-line no-console
    globalThis.console?.log?.('[usergist]', 'trace', trace)
  } catch {
    // swallow
  }
}

export function reportError(message: string, error?: unknown): void {
  try {
    diagnosticHandler?.({
      code: 'sdk_error',
      message: message.slice(0, 200),
      occurredAt: new Date().toISOString(),
    })
  } catch {
    // Host diagnostics must never cross the SDK boundary.
  }
  if (!__DEV__ || !state.enabled) return
  try {
    // eslint-disable-next-line no-console
    globalThis.console?.warn?.('[usergist]', message, error)
  } catch {
    // swallow
  }
}

export function debugLog(message: string, detail?: unknown): void {
  if (!__DEV__ || !state.enabled) return
  try {
    // eslint-disable-next-line no-console
    globalThis.console?.log?.('[usergist]', message, detail ?? '')
  } catch {
    // swallow
  }
}
