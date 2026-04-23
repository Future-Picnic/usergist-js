// The engine owns all singleton state and orchestrates the modules.
// `Ritmus.ts` wraps these functions in a thin, try/catch-guarded public API.

import type {
  EventPropertyValue,
  IngestBatch,
  IngestEvent,
  SdkConfig,
  SubmitResponsePayload,
} from '@ritmus/sdk-core'
import {
  STORAGE_KEYS,
  createStorageScope,
  type StorageScope,
} from './storage.js'
import { createIdentityManager, type IdentityManager } from './identity.js'
import { createConsentManager, type ConsentManager } from './consent.js'
import { createEventQueue, type EventQueue } from './queue.js'
import { createTransport, type Transport } from './transport.js'
import { createRulesCache, type RulesCache } from './rules-cache.js'
import { createFrequencyCapManager, type FrequencyCapManager } from './frequency-cap.js'
import { createUserStateStore, type UserStateStore } from './user-state.js'
import { createTriggerMatcher, type TriggerMatcher } from './trigger-matcher.js'
import { createLifecycleManager, type LifecycleManager } from './lifecycle.js'
import { createContextProvider, type ContextProvider } from './context.js'
import { createEventBus, type EventBus } from './events.js'
import { setDebugEnabled, reportError, debugLog } from './debug.js'
import type {
  QueuedEvent,
  ResolvedConfig,
  ResponseEmission,
} from './types.js'
import type { ResolvedTheme } from '../ui/theme.js'

const DEFAULTS = {
  apiUrl: 'https://api.ritmus.studio',
  environment: 'production' as const,
  flushIntervalMs: 15_000,
  flushBatchSize: 100,
  maxQueueSize: 1000,
  triggerSyncIntervalMs: 300_000,
  debug: false,
}

export interface Engine {
  readonly config: ResolvedConfig
  readonly storage: StorageScope
  readonly identity: IdentityManager
  readonly consent: ConsentManager
  readonly queue: EventQueue
  readonly transport: Transport
  readonly rules: RulesCache
  readonly caps: FrequencyCapManager
  readonly userState: UserStateStore
  readonly matcher: TriggerMatcher
  readonly lifecycle: LifecycleManager
  readonly context: ContextProvider
  readonly events: EventBus
  hydrated: boolean
  hydratingPromise: Promise<void> | null
  flushTimer: ReturnType<typeof setTimeout> | null
  themeOverride: ResolvedTheme | null
}

export function resolveConfig(config: SdkConfig): ResolvedConfig {
  if (!config || typeof config.writeKey !== 'string' || config.writeKey.length === 0) {
    throw new Error('Ritmus.init requires a writeKey')
  }
  return {
    writeKey: config.writeKey,
    apiUrl: config.apiUrl ?? DEFAULTS.apiUrl,
    environment: config.environment ?? DEFAULTS.environment,
    flushIntervalMs: config.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
    flushBatchSize: config.flushBatchSize ?? DEFAULTS.flushBatchSize,
    maxQueueSize: config.maxQueueSize ?? DEFAULTS.maxQueueSize,
    triggerSyncIntervalMs: config.triggerSyncIntervalMs ?? DEFAULTS.triggerSyncIntervalMs,
    debug: config.debug ?? DEFAULTS.debug,
  }
}

export function createEngine(config: SdkConfig): Engine {
  const resolved = resolveConfig(config)
  setDebugEnabled(resolved.debug)

  const storage = createStorageScope(resolved.writeKey)
  const identity = createIdentityManager(storage)
  const consent = createConsentManager(storage)
  const queue = createEventQueue(storage, resolved.maxQueueSize)
  const transport = createTransport({ writeKey: resolved.writeKey, apiUrl: resolved.apiUrl })
  const rules = createRulesCache(storage, transport, resolved.triggerSyncIntervalMs)
  const caps = createFrequencyCapManager(storage)
  const userState = createUserStateStore(storage)
  const events = createEventBus()
  const matcher = createTriggerMatcher({
    rulesCache: rules,
    frequencyCaps: caps,
    userState,
    consent,
    events,
  })
  const context = createContextProvider()

  // Ref lets us forward-reference the fully-built engine from the
  // lifecycle handlers (which are only invoked asynchronously).
  const ref: { value: Engine | null } = { value: null }
  function eng(): Engine {
    if (!ref.value) throw new Error('engine not ready')
    return ref.value
  }

  const lifecycle = createLifecycleManager({
    onForeground: () => {
      const e = eng()
      void ensureHydrated(e).then(() => {
        const id = e.identity.get()
        void e.rules.refresh({ anonymousId: id.anonymousId, externalId: id.externalId })
        void flushNow(e)
      })
    },
    onBackground: () => {
      void flushNow(eng())
    },
    onSyncTick: () => {
      const e = eng()
      const id = e.identity.get()
      void e.rules.refresh({ anonymousId: id.anonymousId, externalId: id.externalId })
    },
    syncIntervalMs: resolved.triggerSyncIntervalMs,
  })

  const engine: Engine = {
    config: resolved,
    storage,
    identity,
    consent,
    queue,
    transport,
    rules,
    caps,
    userState,
    matcher,
    lifecycle,
    context,
    events,
    hydrated: false,
    hydratingPromise: null,
    flushTimer: null,
    themeOverride: null,
  }
  ref.value = engine

  queue.onOverflow((dropped) => {
    debugLog('queue overflow', { dropped, queueSize: queue.size() })
  })
  consent.subscribe((s) => {
    if (s.feedback || s.analytics) void flushNow(engine)
  })

  return engine
}

export async function ensureHydrated(engine: Engine): Promise<void> {
  if (engine.hydrated) return
  if (engine.hydratingPromise) return engine.hydratingPromise
  engine.hydratingPromise = (async () => {
    try {
      await Promise.all([
        engine.identity.hydrate(),
        engine.consent.hydrate(),
        engine.queue.hydrate(),
        engine.caps.hydrate(),
        engine.userState.hydrate(),
        engine.rules.hydrate(),
      ])
      engine.hydrated = true
      const id = engine.identity.get()
      void engine.rules.refresh({ anonymousId: id.anonymousId, externalId: id.externalId })
    } catch (e) {
      reportError('ensureHydrated failed', e)
    }
  })()
  return engine.hydratingPromise
}

export function scheduleFlush(engine: Engine): void {
  if (engine.flushTimer) return
  engine.flushTimer = setTimeout(() => {
    engine.flushTimer = null
    void flushNow(engine)
  }, engine.config.flushIntervalMs)
}

export async function flushNow(engine: Engine): Promise<void> {
  try {
    await ensureHydrated(engine)
    if (!engine.consent.allowsTransport()) return
    while (engine.queue.size() > 0) {
      const batch = engine.queue.peek(engine.config.flushBatchSize)
      if (batch.length === 0) break
      const id = engine.identity.get()
      const ingestEvents: ReadonlyArray<IngestEvent> = batch.map((e) => ({
        name: e.name,
        timestamp: e.timestamp,
        anonymousId: e.anonymousId,
        externalId: e.externalId,
        ...(e.properties ? { properties: e.properties } : {}),
        ...(e.sessionId ? { sessionId: e.sessionId } : {}),
        sdkVersion: engine.context.sdkVersion(),
        platform: engine.context.platform(),
      }))
      const payload: IngestBatch = {
        events: ingestEvents,
        context: engine.context.build({ anonymousId: id.anonymousId, externalId: id.externalId }),
      }
      try {
        await engine.transport.ingest(payload)
        engine.queue.drop(batch.length)
      } catch (e) {
        reportError('ingest failed', e)
        return
      }
    }
  } catch (e) {
    reportError('flushNow failed', e)
  }
}

export function asEventProps(
  properties: Record<string, EventPropertyValue> | undefined,
): Readonly<Record<string, EventPropertyValue>> | undefined {
  if (!properties) return undefined
  const out: Record<string, EventPropertyValue> = {}
  for (const k of Object.keys(properties)) {
    const v = properties[k]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  return out
}

export function enqueueAndEvaluate(
  engine: Engine,
  eventName: string,
  properties: Readonly<Record<string, EventPropertyValue>> | undefined,
): void {
  const now = Date.now()
  const id = engine.identity.get()
  const base: QueuedEvent = {
    name: eventName,
    timestamp: new Date(now).toISOString(),
    anonymousId: id.anonymousId || 'pending',
    externalId: id.externalId,
    ...(properties ? { properties } : {}),
  }
  if (engine.hydrated) {
    engine.queue.enqueue(base)
    engine.userState.recordEvent(eventName, now)
    engine.matcher.evaluate(eventName)
    if (engine.queue.size() >= engine.config.flushBatchSize) void flushNow(engine)
    else scheduleFlush(engine)
    return
  }
  void ensureHydrated(engine).then(() => {
    const fresh = engine.identity.get()
    const withId: QueuedEvent = {
      ...base,
      anonymousId: fresh.anonymousId,
      externalId: fresh.externalId,
    }
    engine.queue.enqueue(withId)
    engine.userState.recordEvent(eventName, now)
    engine.matcher.evaluate(eventName)
    if (engine.queue.size() >= engine.config.flushBatchSize) void flushNow(engine)
    else scheduleFlush(engine)
  })
}

export async function submitResponse(
  engine: Engine,
  payload: ResponseEmission,
  triggerEventName: string,
  trackInternal: (name: string, props: Readonly<Record<string, EventPropertyValue>>) => void,
): Promise<void> {
  const id = engine.identity.get()
  const submitPayload: SubmitResponsePayload = {
    promptId: payload.promptId,
    anonymousId: id.anonymousId,
    externalId: id.externalId,
    answers: payload.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
    dismissed: payload.dismissed,
    latencyMs: payload.latencyMs,
  }
  engine.events.emit('response', payload)
  trackInternal('$feedback_response', {
    promptId: payload.promptId,
    dismissed: payload.dismissed,
    latencyMs: payload.latencyMs,
    triggerEventName,
  })
  if (!engine.consent.allowsFeedback()) return
  try {
    await engine.transport.submitResponse(submitPayload)
  } catch (e) {
    reportError('submitResponse failed', e)
  }
}

export async function clearAllState(engine: Engine): Promise<void> {
  engine.transport.cancelAll()
  if (engine.flushTimer) {
    clearTimeout(engine.flushTimer)
    engine.flushTimer = null
  }
  await ensureHydrated(engine)
  await Promise.all([
    engine.queue.clear(),
    engine.identity.clear(),
    engine.caps.clear(),
    engine.rules.clear(),
    engine.userState.clear(),
    engine.consent.clear(),
  ])
  await engine.storage.clearAll([
    STORAGE_KEYS.identity,
    STORAGE_KEYS.consent,
    STORAGE_KEYS.queue,
    STORAGE_KEYS.rulesCache,
    STORAGE_KEYS.frequencyCaps,
    STORAGE_KEYS.userProperties,
    STORAGE_KEYS.eventHistory,
  ])
  await engine.identity.hydrate()
}
