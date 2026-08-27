// The engine owns all singleton state and orchestrates the modules.
// `UserGist.ts` wraps these functions in a thin, try/catch-guarded public API.

import type {
  EventPropertyValue,
  IngestBatch,
  IngestEvent,
  SdkConfig,
  SubmitResponsePayload,
  CompleteSurveyAttemptRequest,
  ClientPrompt,
  ArmedInAppMessage,
} from '@usergist/sdk-core/mobile'
import { APP_OPEN_EVENT_NAME } from '@usergist/sdk-core/mobile'
import {
  STORAGE_KEYS,
  createStorageScope,
  type StorageScope,
} from './storage.js'
import { createIdentityManager, generateEventId, type IdentityManager } from './identity.js'
import { createConsentManager, type ConsentManager } from './consent.js'
import { createEventQueue, type EventQueue } from './queue.js'
import { createTransport, PermanentHttpError, type Transport } from './transport.js'
import { createRulesCache, type RulesCache } from './rules-cache.js'
import {
  createSurveyRulesCache,
  type SurveyRulesCache,
} from './survey-rules-cache.js'
import { createFrequencyCapManager, type FrequencyCapManager } from './frequency-cap.js'
import { createUserStateStore, type UserStateStore } from './user-state.js'
import { createTriggerMatcher, type TriggerMatcher } from './trigger-matcher.js'
import { createSurveyMatcher, type SurveyMatcher } from './survey-matcher.js'
import { createInAppRulesCache, type InAppRulesCache } from './inapp-rules-cache.js'
import { createInAppMatcher, type InAppMatcher } from './inapp-matcher.js'
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
import { createMutationQueue, type MutationQueue } from './mutation-queue.js'
import {
  createLocalInstructionDedupe,
  type LocalInstructionDedupe,
} from './instruction-dedupe.js'

const ENVIRONMENT_API_URLS = {
  production: 'https://api.usergist.studio',
  staging: 'https://api.staging.usergist.studio',
  development: 'http://localhost:28743',
} as const

const DEFAULTS = {
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
  readonly mutations: MutationQueue
  readonly transport: Transport
  readonly rules: RulesCache
  readonly surveyRules: SurveyRulesCache
  readonly inAppRules: InAppRulesCache
  readonly caps: FrequencyCapManager
  readonly userState: UserStateStore
  readonly matcher: TriggerMatcher
  readonly surveyMatcher: SurveyMatcher
  readonly inAppMatcher: InAppMatcher
  readonly lifecycle: LifecycleManager
  readonly context: ContextProvider
  readonly events: EventBus
  hydrated: boolean
  hydratingPromise: Promise<void> | null
  flushTimer: ReturnType<typeof setTimeout> | null
  flushPromise: Promise<void> | null
  mutationFlushPromise: Promise<MutationFlushResult> | null
  subjectToken: string | null
  sessionPromise: Promise<void> | null
  instructionPollPromise: Promise<void> | null
  resetGeneration: number
  resetting: boolean
  readonly localInstructionDedupe: LocalInstructionDedupe
  /** Survey campaigns rendered immediately on-device; suppresses the later
   * offer-ledger poll for the same campaign. */
  readonly locallyHandledSurveyIds: Set<string>
  themeOverride: ResolvedTheme | null
  /** Last push token registered with the server. Used by `rebindPushToken`. */
  lastPushToken: string | null
  lastPushRegistrationKey: string | null
  lastPushRegistrationAt: number
}

export function resolveConfig(config: SdkConfig): ResolvedConfig {
  if (!config || typeof config.writeKey !== 'string' || config.writeKey.length === 0) {
    throw new Error('UserGist.init requires a writeKey')
  }
  const environment = config.environment ?? DEFAULTS.environment
  const apiUrl = config.apiUrl ?? ENVIRONMENT_API_URLS[environment]
  if (environment === 'production' && !apiUrl.startsWith('https://')) {
    throw new Error('UserGist production apiUrl must use HTTPS')
  }
  return {
    writeKey: config.writeKey,
    apiUrl,
    environment,
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
  const mutations = createMutationQueue(storage)
  const localInstructionDedupe = createLocalInstructionDedupe(storage)
  const transport = createTransport({ writeKey: resolved.writeKey, apiUrl: resolved.apiUrl })
  const rules = createRulesCache(storage, transport, resolved.triggerSyncIntervalMs)
  const surveyRules = createSurveyRulesCache(
    storage,
    transport,
    resolved.triggerSyncIntervalMs,
  )
  const inAppRules = createInAppRulesCache(
    storage,
    transport,
    resolved.triggerSyncIntervalMs,
  )
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
  const surveyMatcher = createSurveyMatcher({
    rulesCache: surveyRules,
    frequencyCaps: caps,
    userState,
    consent,
    events,
  })
  const inAppMatcher = createInAppMatcher({
    rulesCache: inAppRules,
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
      void ensureHydrated(e).then(async () => {
        await refreshTargetingRules(e)
        emitAppOpenWhenConsentReady(e)
        void flushNow(e)
        void pollSurveyOffers(e)
        void pollInstructions(e)
      })
    },
    onBackground: () => {
      void flushNow(eng())
    },
    onSyncTick: () => {
      const e = eng()
      void refreshTargetingRules(e)
      void flushMutations(e)
      void pollSurveyOffers(e)
      void pollInstructions(e)
    },
    syncIntervalMs: resolved.triggerSyncIntervalMs,
  })

  const engine: Engine = {
    config: resolved,
    storage,
    identity,
    consent,
    queue,
    mutations,
    transport,
    rules,
    surveyRules,
    inAppRules,
    caps,
    userState,
    matcher,
    surveyMatcher,
    inAppMatcher,
    lifecycle,
    context,
    events,
    hydrated: false,
    hydratingPromise: null,
    flushTimer: null,
    flushPromise: null,
    mutationFlushPromise: null,
    subjectToken: null,
    sessionPromise: null,
    instructionPollPromise: null,
    resetGeneration: 0,
    resetting: false,
    localInstructionDedupe,
    locallyHandledSurveyIds: new Set(),
    themeOverride: null,
    lastPushToken: null,
    lastPushRegistrationKey: null,
    lastPushRegistrationAt: 0,
  }
  ref.value = engine

  queue.onOverflow((dropped) => {
    debugLog('queue overflow', { dropped, queueSize: queue.size() })
  })
  events.on('promptShown', (payload) => {
    matcher.recordShown(payload.promptId, payload.shownAt)
  })
  consent.subscribe((s) => {
    if (!s.analytics) engine.queue.removePurpose('analytics')
    if (!s.feedback) {
      engine.queue.removePurpose('feedback')
      void engine.mutations.removePurpose('feedback')
      engine.matcher.resetPending()
    }
    if (!s.survey) {
      void engine.mutations.removePurpose('survey')
      engine.surveyMatcher.resetPending()
    }
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
        engine.mutations.hydrate(),
        engine.caps.hydrate(),
        engine.userState.hydrate(),
        engine.rules.hydrate(),
        engine.surveyRules.hydrate(),
        engine.inAppRules.hydrate(),
        engine.localInstructionDedupe.hydrate(),
      ])
      await ensureSubjectSession(engine)
      engine.hydrated = true
    } catch (e) {
      reportError('ensureHydrated failed', e)
    } finally {
      // A transient session/storage failure must not permanently poison this
      // engine instance. Leave successful hydration fast, but allow a later
      // public call or foreground transition to retry a failed attempt.
      if (!engine.hydrated) engine.hydratingPromise = null
    }
  })()
  return engine.hydratingPromise
}

export async function ensureSubjectSession(engine: Engine): Promise<void> {
  if (engine.subjectToken) return
  if (engine.sessionPromise) return engine.sessionPromise
  engine.sessionPromise = (async () => {
    const id = engine.identity.get()
    const persisted = await engine.storage.getJson<string>(STORAGE_KEYS.subjectToken)
    try {
      const session = await engine.transport.session({
        anonymousId: id.anonymousId,
        ...(persisted ? { currentToken: persisted } : {}),
      })
      engine.subjectToken = session.subjectToken
      engine.transport.setSubjectToken(session.subjectToken)
      await engine.storage.setJson(STORAGE_KEYS.subjectToken, session.subjectToken)
    } catch (error) {
      const mayRotate = error instanceof PermanentHttpError &&
        (error.status === 401 || error.status === 403 || error.status === 409)
      if (!mayRotate) throw error
      // A lost/expired credential must never be replaced for the same known
      // anonymous ID. Rotate to a fresh installation identity and establish a
      // new server-bound subject instead.
      if (persisted) await engine.storage.remove(STORAGE_KEYS.subjectToken)
      const rotated = await engine.identity.rotate()
      const session = await engine.transport.session({ anonymousId: rotated.anonymousId })
      engine.subjectToken = session.subjectToken
      engine.transport.setSubjectToken(session.subjectToken)
      await engine.storage.setJson(STORAGE_KEYS.subjectToken, session.subjectToken)
    }
  })().finally(() => {
    engine.sessionPromise = null
  })
  return engine.sessionPromise
}

export async function refreshTargetingRules(
  engine: Engine,
  force = false,
): Promise<void> {
  if (engine.resetting) return
  await ensureHydrated(engine)
  if (engine.resetting) return
  const id = engine.identity.get()
  await Promise.all([
    engine.rules.refresh({
      anonymousId: id.anonymousId,
      externalId: id.externalId,
      force,
    }),
    engine.surveyRules.refresh({
      anonymousId: id.anonymousId,
      externalId: id.externalId,
      force,
    }),
    engine.inAppRules.refresh({
      anonymousId: id.anonymousId,
      externalId: id.externalId,
      force,
    }),
  ])
}

/**
 * Emit the lifecycle `$app_open` event, but only AFTER feedback consent
 * is granted. The matcher blocks by consent — if we fire too early
 * (before host has called setConsent), the lifecycle event is silently
 * dropped and the user never sees the prompt this session.
 *
 * If consent is already granted: emit immediately.
 * Otherwise: subscribe to consent changes; emit on the first transition
 * where `feedback === true`. Idempotent: only fires once per call.
 */
export function emitAppOpenWhenConsentReady(engine: Engine): void {
  if (engine.resetting) return
  const pending = pendingAppOpenConsent.get(engine)
  if (engine.consent.allowsFeedback()) {
    pending?.()
    pendingAppOpenConsent.delete(engine)
    enqueueAndEvaluate(engine, APP_OPEN_EVENT_NAME, undefined, 'feedback')
    return
  }
  if (pending) return
  let fired = false
  const unsubscribe = engine.consent.subscribe((s) => {
    if (fired || !s.feedback) return
    fired = true
    enqueueAndEvaluate(engine, APP_OPEN_EVENT_NAME, undefined, 'feedback')
    unsubscribe()
    pendingAppOpenConsent.delete(engine)
  })
  pendingAppOpenConsent.set(engine, unsubscribe)
}

const pendingAppOpenConsent = new WeakMap<Engine, () => void>()
function instructionKey(type: string, refId: string, eventId: string): string {
  return `${type}:${refId}:event:${eventId}`
}

function rememberLocalInstruction(engine: Engine, key: string): void {
  engine.localInstructionDedupe.remember(key)
}

export function scheduleFlush(engine: Engine): void {
  if (engine.flushTimer) return
  engine.flushTimer = setTimeout(() => {
    engine.flushTimer = null
    void flushNow(engine)
  }, engine.config.flushIntervalMs)
}

export async function flushNow(engine: Engine): Promise<void> {
  if (engine.resetting) return
  if (engine.flushPromise) return engine.flushPromise
  engine.flushPromise = performFlush(engine).finally(() => {
    engine.flushPromise = null
  })
  return engine.flushPromise
}

async function performFlush(engine: Engine): Promise<void> {
  try {
    await ensureHydrated(engine)
    while (engine.queue.size() > 0) {
      const consent = engine.consent.get()
      const allowed = engine.queue.snapshot().filter((event) =>
        event.purpose === 'analytics' ? consent.analytics : consent.feedback,
      )
      const firstAllowed = allowed[0]
      if (!firstAllowed) break
      // An identify transition can leave pre-identify events queued beside
      // post-identify events. The API deliberately rejects a batch whose
      // event identities differ from its context, so drain one identity at a
      // time while retaining FIFO order within that identity.
      const batch = allowed.filter((event) =>
        event.anonymousId === firstAllowed.anonymousId &&
        event.externalId === firstAllowed.externalId,
      ).slice(0, engine.config.flushBatchSize)
      if (batch.length === 0) break
      const ingestEvents: ReadonlyArray<IngestEvent> = batch.map((e) => ({
        eventId: e.eventId,
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
        context: engine.context.build({
          anonymousId: batch[0]!.anonymousId,
          externalId: batch[0]!.externalId,
        }),
      }
      try {
        await engine.transport.ingest(payload)
        engine.queue.remove(batch.map((event) => event.eventId))
      } catch (e) {
        if (e instanceof PermanentHttpError) {
          if (batch.length === 1) {
            engine.queue.remove([batch[0]!.eventId])
            reportError('ingest event quarantined after permanent rejection', {
              eventId: batch[0]!.eventId,
              status: e.status,
            })
            continue
          }
          // Retry smaller slices on the next loop so one invalid entry cannot
          // permanently block every later event on this installation.
          const first = batch[0]!
          try {
            await engine.transport.ingest({
              events: [ingestEvents[0]!],
              context: engine.context.build({
                anonymousId: first.anonymousId,
                externalId: first.externalId,
              }),
            })
            engine.queue.remove([first.eventId])
          } catch (singleError) {
            if (singleError instanceof PermanentHttpError) {
              engine.queue.remove([first.eventId])
              reportError('ingest event quarantined after permanent rejection', {
                eventId: first.eventId,
                status: singleError.status,
              })
              continue
            }
            reportError('ingest failed', singleError)
            return
          }
          continue
        }
        reportError('ingest failed', e)
        return
      }
    }
    // After draining the queue, opportunistically pull pending survey offers.
    await flushMutations(engine)
    // Triggered surveys appear in the offer ledger after the server processes
    // the event; the small delay gives NATS + the trigger engine time to
    // run before we ask.
    setTimeout(() => {
      void pollSurveyOffers(engine)
      void pollInstructions(engine)
    }, 1500)
  } catch (e) {
    reportError('flushNow failed', e)
  }
}

export interface MutationFlushResult {
  readonly permanentlyRejectedIds: ReadonlySet<string>
}

export async function flushMutations(engine: Engine): Promise<MutationFlushResult> {
  if (engine.resetting) return { permanentlyRejectedIds: new Set() }
  if (engine.mutationFlushPromise) return engine.mutationFlushPromise
  engine.mutationFlushPromise = performMutationFlush(engine).finally(() => {
    engine.mutationFlushPromise = null
  })
  return engine.mutationFlushPromise
}

async function performMutationFlush(engine: Engine): Promise<MutationFlushResult> {
  const permanentlyRejectedIds = new Set<string>()
  while (engine.mutations.size() > 0) {
    if (engine.resetting) break
    const mutation = engine.mutations.peek()
    if (!mutation) break
    const deliveryGeneration = engine.resetGeneration
    const consent = engine.consent.get()
    if (mutation.purpose === 'feedback' && !consent.feedback) break
    if (mutation.purpose === 'survey' && !consent.survey) break
    try {
      if (mutation.kind === 'feedback-response') {
        await engine.transport.submitResponse(
          mutation.payload as unknown as SubmitResponsePayload,
        )
      } else if (mutation.kind === 'survey-complete') {
        const attemptId = mutation.payload.attemptId
        if (typeof attemptId !== 'string') throw new Error('invalid-survey-mutation')
        await engine.transport.surveyComplete(
          attemptId,
          mutation.payload.body as unknown as CompleteSurveyAttemptRequest,
        )
      } else if (mutation.kind === 'survey-abandon') {
        const attemptId = mutation.payload.attemptId
        if (typeof attemptId !== 'string') throw new Error('invalid-survey-mutation')
        await engine.transport.surveyAbandon(attemptId)
      } else {
        const subjectToken = mutation.payload.subjectToken
        const anonymousId = mutation.payload.anonymousId
        const externalId = mutation.payload.externalId
        const properties = mutation.payload.properties
        if (
          typeof subjectToken !== 'string' ||
          typeof anonymousId !== 'string' ||
          typeof externalId !== 'string'
        ) throw new Error('invalid-identify-mutation')
        try {
          await engine.transport.identify(
            {
              anonymousId,
              externalId,
              ...(properties && typeof properties === 'object'
                ? { properties: properties as Readonly<Record<string, EventPropertyValue>> }
                : {}),
            },
            subjectToken,
          )
          if (engine.resetting || engine.resetGeneration !== deliveryGeneration) break
          await engine.storage.setJsonStrict(STORAGE_KEYS.subjectToken, subjectToken)
          if (engine.resetting || engine.resetGeneration !== deliveryGeneration) break
          engine.subjectToken = subjectToken
          engine.transport.setSubjectToken(subjectToken)
          await engine.identity.setExternalId(externalId)
          if (properties && typeof properties === 'object') {
            const clean = properties as Readonly<Record<string, EventPropertyValue>>
            engine.userState.mergeProperties(clean)
            if (engine.consent.allowsAnalytics()) {
              enqueueAndEvaluate(engine, '$identify', clean)
            }
          } else if (engine.consent.allowsAnalytics()) {
            enqueueAndEvaluate(engine, '$identify', undefined)
          }
        } catch (error) {
          throw error
        }
      }
      if (engine.resetting || engine.resetGeneration !== deliveryGeneration) break
      await engine.mutations.remove(mutation.id)
    } catch (error) {
      if (engine.resetting || engine.resetGeneration !== deliveryGeneration) break
      if (error instanceof PermanentHttpError) {
        await engine.mutations.remove(mutation.id)
        permanentlyRejectedIds.add(mutation.id)
        reportError('mutation quarantined after permanent rejection', {
          mutationId: mutation.id,
          kind: mutation.kind,
          status: error.status,
        })
      } else {
        debugLog('mutation delivery deferred', {
          mutationId: mutation.id,
          kind: mutation.kind,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
      break
    }
  }
  return { permanentlyRejectedIds }
}

const SEEN_OFFERS_KEY = 'surveys:seen-offers'
const POLL_BACKOFF_MS = 5_000
let lastPollAt = 0

export async function pollSurveyOffers(engine: Engine): Promise<void> {
  try {
    if (engine.resetting) return
    const now = Date.now()
    if (now - lastPollAt < POLL_BACKOFF_MS) return
    lastPollAt = now

    if (!engine.consent.get().survey) return

    const id = engine.identity.get()
    const res = await engine.transport.surveysAvailable({
      anonymousId: id.anonymousId,
      externalId: id.externalId ?? null,
    })
    const surveys = res.surveys ?? []
    if (surveys.length === 0) return

    const seen = (await engine.storage.getJson<ReadonlyArray<string>>(SEEN_OFFERS_KEY)) ?? []
    const seenSet = new Set(seen)
    const localIds = surveys
      .map((survey) => survey.id)
      .filter((surveyId) => engine.locallyHandledSurveyIds.has(surveyId))
    const fresh = surveys.filter(
      (survey) =>
        !seenSet.has(survey.id) &&
        !engine.locallyHandledSurveyIds.has(survey.id),
    )
    if (fresh.length === 0 && localIds.length === 0) return

    for (const s of fresh) {
      engine.events.emit('surveyInvite', {
        surveyId: s.id,
        name: s.name,
        source: s.source,
      })
    }

    // A locally rendered survey and its later offer-ledger row represent one
    // delivery. Persist both classes as seen so polling cannot reopen a modal
    // minutes after the user already completed or dismissed it.
    const nextSeen = [
      ...new Set([...seen, ...localIds, ...fresh.map((survey) => survey.id)]),
    ].slice(-200)
    await engine.storage.setJson(SEEN_OFFERS_KEY, nextSeen)
  } catch (e) {
    reportError('pollSurveyOffers failed', e)
  }
}

export async function pollInstructions(engine: Engine): Promise<void> {
  if (engine.resetting) return
  if (engine.instructionPollPromise) return engine.instructionPollPromise
  engine.instructionPollPromise = performInstructionPoll(engine).finally(() => {
    engine.instructionPollPromise = null
  })
  return engine.instructionPollPromise
}

async function performInstructionPoll(engine: Engine): Promise<void> {
  try {
    await ensureHydrated(engine)
    const after = (await engine.storage.getJson<number>(STORAGE_KEYS.instructionCursor)) ?? 0
    const seen = (await engine.storage.getJson<ReadonlyArray<number>>(
      STORAGE_KEYS.seenInstructions,
    )) ?? []
    const seenSet = new Set(seen)
    const result = await engine.transport.instructions(after)
    if (result.instructions.length === 0) return

    const handledIds: number[] = []
    for (const instruction of result.instructions) {
      handledIds.push(instruction.id)
      if (seenSet.has(instruction.id)) continue
      dispatchInstruction(engine, instruction.type, instruction.payload)
      seenSet.add(instruction.id)
      await engine.storage.setJsonStrict(
        STORAGE_KEYS.seenInstructions,
        [...seenSet].slice(-200),
      )
    }
    await engine.storage.setJsonStrict(
      STORAGE_KEYS.instructionCursor,
      Math.max(after, ...handledIds),
    )
    await engine.transport.acknowledgeInstructions(handledIds)
  } catch (error) {
    reportError('instruction poll failed', error)
  }
}

function dispatchInstruction(
  engine: Engine,
  type: string,
  payload: Readonly<Record<string, unknown>>,
): void {
  if (type === 'prompt.show') {
    if (!engine.consent.allowsFeedback()) return
    const promptId = payload.promptId
    const prompt = payload.prompt
    if (typeof promptId !== 'string' || !prompt || typeof prompt !== 'object') return
    const triggerEventId = payload.triggerEventId
    if (
      typeof triggerEventId === 'string' &&
      engine.localInstructionDedupe.consume(
        instructionKey('prompt.show', promptId, triggerEventId),
      )
    ) {
      debugLog('prompt instruction skipped after immediate local render', {
        promptId,
        triggerEventId,
      })
      return
    }
    const shownAt = Date.now()
    const typedPrompt = prompt as ClientPrompt
    const emission = {
      promptId,
      prompt: typedPrompt,
      theme: typedPrompt.theme,
      shownAt,
      triggerEventName: typeof payload.triggerEventName === 'string'
        ? payload.triggerEventName
        : 'server',
    }
    engine.events.emit('showPrompt', emission)
    return
  }
  if (type === 'survey.offer') {
    if (!engine.consent.allowsSurvey()) return
    if (typeof payload.surveyId !== 'string' || typeof payload.name !== 'string') return
    const triggerEventId = payload.triggerEventId
    if (
      typeof triggerEventId === 'string' &&
      engine.localInstructionDedupe.consume(
        instructionKey('survey.offer', payload.surveyId, triggerEventId),
      )
    ) {
      debugLog('survey instruction skipped after immediate local render', {
        surveyId: payload.surveyId,
        triggerEventId,
      })
      return
    }
    engine.events.emit('surveyInvite', {
      surveyId: payload.surveyId,
      name: payload.name,
      source: typeof payload.source === 'string' ? payload.source : 'triggered',
    })
    return
  }
  if (type === 'inapp.show') {
    if (!engine.consent.allowsFeedback()) return
    const message = payload.message
    if (!message || typeof message !== 'object') return
    const typed = message as ArmedInAppMessage
    const triggerEventId = payload.triggerEventId
    if (
      typeof triggerEventId === 'string' &&
      engine.localInstructionDedupe.consume(
        instructionKey('inapp.show', typed.messageId, triggerEventId),
      )
    ) {
      debugLog('in-app instruction skipped after immediate local render', {
        messageId: typed.messageId,
        triggerEventId,
      })
      return
    }
    engine.events.emit('showInAppMessage', {
      messageId: typed.messageId,
      message: typed,
      shownAt: Date.now(),
      triggerEventName: typeof payload.triggerEventName === 'string'
        ? payload.triggerEventName
        : 'server',
    })
    return
  }
  if (type.startsWith('request.')) {
    engine.events.emit('pushEvent', {
      name: `$${type.replaceAll('.', '_')}`,
      props: payload,
    })
  }
}

export function asEventProps(
  properties: Record<string, EventPropertyValue> | undefined,
): Readonly<Record<string, EventPropertyValue>> | undefined {
  if (!properties) return undefined
  const out: Record<string, EventPropertyValue> = {}
  const piiKey = /(?:^|[._])(email|phone|ssn|tax_id)$/i
  for (const k of Object.keys(properties).slice(0, 100)) {
    if (!k || k.length > 120 || piiKey.test(k)) continue
    const v = properties[k]
    if (typeof v === 'string') {
      out[k] = v.slice(0, 10_000)
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  return out
}

export function enqueueAndEvaluate(
  engine: Engine,
  eventName: string,
  properties: Readonly<Record<string, EventPropertyValue>> | undefined,
  purpose: QueuedEvent['purpose'] = 'analytics',
): void {
  const now = Date.now()
  const id = engine.identity.get()
  const base: QueuedEvent = {
    eventId: generateEventId(),
    purpose,
    name: eventName,
    timestamp: new Date(now).toISOString(),
    anonymousId: id.anonymousId || 'pending',
    externalId: id.externalId,
    ...(properties ? { properties } : {}),
  }
  if (engine.hydrated) {
    engine.queue.enqueue(base)
    engine.userState.recordEvent(eventName, now)
    evaluateLocally(engine, eventName, base.eventId)
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
    evaluateLocally(engine, eventName, withId.eventId)
    if (engine.queue.size() >= engine.config.flushBatchSize) void flushNow(engine)
    else scheduleFlush(engine)
  })
}

function evaluateLocally(engine: Engine, eventName: string, eventId: string): void {
  const promptId = engine.matcher.evaluate(eventName)
  if (promptId) {
    rememberLocalInstruction(
      engine,
      instructionKey('prompt.show', promptId, eventId),
    )
  }
  const surveyId = engine.surveyMatcher.evaluate(eventName)
  if (surveyId) {
    engine.locallyHandledSurveyIds.add(surveyId)
    rememberLocalInstruction(
      engine,
      instructionKey('survey.offer', surveyId, eventId),
    )
  }
  const messageId = engine.inAppMatcher.evaluate(eventName)
  if (messageId) {
    rememberLocalInstruction(
      engine,
      instructionKey('inapp.show', messageId, eventId),
    )
  }
}

export async function submitResponse(
  engine: Engine,
  payload: ResponseEmission,
  triggerEventName: string,
  trackInternal: (
    name: string,
    props: Readonly<Record<string, EventPropertyValue>>,
    purpose?: QueuedEvent['purpose'],
  ) => void,
): Promise<void> {
  const id = engine.identity.get()
  const submitPayload: SubmitResponsePayload = {
    idempotencyKey: generateEventId(),
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
  }, 'feedback')
  debugLog('[usergist:analyze] response-submit', {
    promptId: payload.promptId,
    answersCount: payload.answers.length,
    dismissed: payload.dismissed,
  })
  if (!engine.consent.allowsFeedback()) return
  await engine.mutations.enqueue(
    'feedback-response',
    'feedback',
    submitPayload as unknown as Readonly<Record<string, unknown>>,
  )
  void flushMutations(engine)
}

export async function clearAllState(engine: Engine): Promise<void> {
  pendingAppOpenConsent.get(engine)?.()
  pendingAppOpenConsent.delete(engine)
  engine.events.emit('resetSurfaces', undefined)
  engine.transport.cancelAll()
  await Promise.allSettled([
    engine.mutationFlushPromise ?? Promise.resolve(),
    engine.flushPromise ?? Promise.resolve(),
    engine.sessionPromise ?? Promise.resolve(),
    engine.instructionPollPromise ?? Promise.resolve(),
  ])
  // Reset is a local privacy operation and must not wait on network retries.
  // Revoke the old credential through an isolated transport so failures cannot
  // open the live engine's circuit or delay the new anonymous session.
  const subjectToken = engine.subjectToken
  if (subjectToken) {
    const revocationTransport = createTransport({
      writeKey: engine.config.writeKey,
      apiUrl: engine.config.apiUrl,
    })
    revocationTransport.setSubjectToken(subjectToken)
    void revocationTransport.revokeSession().catch((error) => {
      debugLog('subject session revoke deferred', {
        reason: error instanceof Error ? error.message : String(error),
      })
    })
  }
  if (engine.flushTimer) {
    clearTimeout(engine.flushTimer)
    engine.flushTimer = null
  }
  await ensureHydrated(engine)
  await Promise.all([
    engine.queue.clear(),
    engine.mutations.clear(),
    engine.identity.clear(),
    engine.caps.clear(),
    engine.rules.clear(),
    engine.surveyRules.clear(),
    engine.inAppRules.clear(),
    engine.userState.clear(),
    engine.consent.clear(),
    engine.localInstructionDedupe.clear(),
  ])
  await engine.storage.clearAll([
    STORAGE_KEYS.identity,
    STORAGE_KEYS.consent,
    STORAGE_KEYS.queue,
    STORAGE_KEYS.rulesCache,
    STORAGE_KEYS.surveyRulesCache,
    STORAGE_KEYS.inAppRulesCache,
    STORAGE_KEYS.frequencyCaps,
    STORAGE_KEYS.userProperties,
    STORAGE_KEYS.eventHistory,
    STORAGE_KEYS.subjectToken,
    STORAGE_KEYS.mutationQueue,
    STORAGE_KEYS.instructionCursor,
    STORAGE_KEYS.seenInstructions,
    STORAGE_KEYS.localInstructionDedupe,
    SEEN_OFFERS_KEY,
  ])
  engine.subjectToken = null
  engine.transport.setSubjectToken(null)
  engine.locallyHandledSurveyIds.clear()
  engine.matcher.resetPending()
  engine.surveyMatcher.resetPending()
  engine.lastPushToken = null
  lastPollAt = 0
  await engine.identity.hydrate()
  await ensureSubjectSession(engine)
}
