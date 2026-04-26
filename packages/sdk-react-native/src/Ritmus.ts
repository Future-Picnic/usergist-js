// Ritmus — public singleton facade.
//
// Philosophy:
//  - `init()` does NOT perform any I/O. It snapshots config and returns.
//    The first call that needs state triggers hydration lazily (via engine).
//  - All public methods catch their own errors and report via debug. The
//    SDK never throws across its boundary.
//  - Track is synchronous for the caller: it enqueues, schedules a flush,
//    and runs the trigger matcher — zero awaits.

import type {
  Consent,
  EventPropertyValue,
  PromptTheme,
  SdkConfig,
  SurveyAnswerRecord,
  SurveyAnswerValue,
  SurveyAttemptSource,
  SurveyCampaignWithFlow,
  SurveySummary,
} from '@ritmus/sdk-core'
import {
  asEventProps,
  clearAllState,
  createEngine,
  ensureHydrated,
  enqueueAndEvaluate,
  flushNow,
  submitResponse,
  type Engine,
} from './internal/engine.js'
import { setDebugEnabled, reportError, debugLog, logTrace, getTraces } from './internal/debug.js'
import type {
  ConsentState,
  IdentityState,
  ResolvedConfig,
  ResponseEmission,
  ShowPromptPayload,
} from './internal/types.js'
import type { EventBus } from './internal/events.js'
import type { FrequencyCapManager } from './internal/frequency-cap.js'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from './ui/theme.js'
import { createSurveyStore, type SurveyStore } from './internal/survey-store.js'

type PromptShownCb = (p: ShowPromptPayload) => void
type ResponseCb = (r: ResponseEmission) => void

interface SurveyHandlers {
  /**
   * Called when a triggered or scheduled survey becomes available for this
   * user. Host app typically renders an invite (banner/toast) and calls
   * `Ritmus.openSurvey(surveyId)` to launch the full flow on tap.
   * If no handler is registered, the survey auto-opens — convenient for
   * dev/testing, but you'll likely want a banner UX in production.
   */
  readonly onInvite?: (invite: {
    readonly surveyId: string
    readonly name: string
    readonly source: string
  }) => void
  readonly onShow?: (surveyId: string) => void
  readonly onComplete?: (surveyId: string, attemptId: string) => void
  readonly onAbandon?: (surveyId: string, attemptId: string) => void
}

let engine: Engine | null = null
let surveyStore: SurveyStore | null = null
let surveyHandlers: SurveyHandlers = {}

function requireEngine(): Engine {
  if (!engine) {
    throw new Error('Ritmus.init must be called before using the SDK')
  }
  return engine
}

function trackInternal(
  name: string,
  props: Readonly<Record<string, EventPropertyValue>>,
): void {
  if (!engine) return
  enqueueAndEvaluate(engine, name, props)
}

export const Ritmus = {
  init(config: SdkConfig): void {
    try {
      if (engine) {
        debugLog('Ritmus.init called twice; ignoring')
        return
      }
      engine = createEngine(config)
      surveyStore = createSurveyStore(config.writeKey)
      engine.lifecycle.start()
    } catch (e) {
      reportError('init failed', e)
    }
  },

  identify(userId: string, properties?: Record<string, EventPropertyValue>): void {
    try {
      if (typeof userId !== 'string' || userId.length === 0) {
        reportError('identify requires a userId string')
        return
      }
      const e = requireEngine()
      void (async () => {
        await ensureHydrated(e)
        await e.identity.setExternalId(userId)
        const cleanProps = asEventProps(properties)
        if (cleanProps) e.userState.mergeProperties(cleanProps)
        enqueueAndEvaluate(e, '$identify', cleanProps)
        if (!e.consent.allowsTransport()) return
        try {
          await e.transport.identify({
            anonymousId: e.identity.get().anonymousId,
            externalId: userId,
            ...(cleanProps ? { properties: cleanProps } : {}),
          })
        } catch (err) {
          reportError('transport.identify failed', err)
        }
      })()
    } catch (err) {
      reportError('identify failed', err)
    }
  },

  track(eventName: string, properties?: Record<string, EventPropertyValue>): void {
    try {
      if (typeof eventName !== 'string' || eventName.length === 0) {
        reportError('track requires a non-empty event name')
        return
      }
      const e = requireEngine()
      const props = asEventProps(properties)
      enqueueAndEvaluate(e, eventName, props)
    } catch (err) {
      reportError('track failed', err)
    }
  },

  setConsent(purposes: Consent): void {
    try {
      const e = requireEngine()
      void (async () => {
        await ensureHydrated(e)
        const next = await e.consent.set(purposes)
        const id = e.identity.get()
        if (next.analytics || next.feedback || next.push || next.survey) {
          try {
            await e.transport.consent({
              anonymousId: id.anonymousId,
              externalId: id.externalId,
              purposes: {
                analytics: next.analytics,
                feedback: next.feedback,
                push: next.push,
                ...(next.survey !== undefined ? { survey: next.survey } : {}),
              },
            })
          } catch (err) {
            reportError('transport.consent failed', err)
          }
          await flushNow(e)
        }
      })()
    } catch (err) {
      reportError('setConsent failed', err)
    }
  },

  reset(): void {
    try {
      const e = requireEngine()
      void clearAllState(e).catch((err: unknown) => reportError('reset failed', err))
    } catch (err) {
      reportError('reset failed', err)
    }
  },

  setThemeOverrides(theme: PromptTheme): void {
    try {
      const e = requireEngine()
      e.themeOverride = theme ? mergeTheme(DEFAULT_THEME, theme) : null
    } catch (err) {
      reportError('setThemeOverrides failed', err)
    }
  },

  flush(): void {
    try {
      const e = requireEngine()
      void flushNow(e)
    } catch (err) {
      reportError('flush failed', err)
    }
  },

  setDebug(enabled: boolean): void {
    try {
      setDebugEnabled(enabled)
    } catch (err) {
      reportError('setDebug failed', err)
    }
  },

  getAnonymousId(): string | null {
    try {
      const id = engine?.identity.get().anonymousId
      return id && id.length > 0 ? id : null
    } catch {
      return null
    }
  },

  onPromptShown(cb: PromptShownCb): () => void {
    try {
      return requireEngine().events.on('promptShown', cb)
    } catch (err) {
      reportError('onPromptShown failed', err)
      return () => {}
    }
  },

  onResponse(cb: ResponseCb): () => void {
    try {
      return requireEngine().events.on('response', cb)
    } catch (err) {
      reportError('onResponse failed', err)
      return () => {}
    }
  },

  async registerPushToken(
    token: string,
    platform: 'ios' | 'android',
    opts?: { environment?: 'production' | 'sandbox' },
  ): Promise<void> {
    try {
      if (!token) return
      const e = requireEngine()
      await ensureHydrated(e)
      // Consent is enforced server-side (the register-token route reads
      // consent_log and refuses if push was explicitly declined). We no
      // longer short-circuit here because the host app typically calls
      // setConsent and registerPushToken in parallel; racing the local
      // consent hydration is not our problem to solve.
      const id = e.identity.get()
      await e.transport.pushRegisterToken({
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        token,
        platform,
        environment: opts?.environment ?? 'production',
        language: undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        appVersion: undefined,
        sdkVersion: 'rn-0.1.0',
        optIn: true,
      })
      debugLog('push token registered with server')
    } catch (err) {
      reportError('registerPushToken failed', err)
    }
  },

  async invalidatePushToken(token: string): Promise<void> {
    try {
      if (!token) return
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      await e.transport.pushInvalidateToken({
        anonymousId: id.anonymousId,
        token,
      })
    } catch (err) {
      reportError('invalidatePushToken failed', err)
    }
  },

  // ---------- Surveys ----------

  async getAvailableSurveys(): Promise<ReadonlyArray<SurveySummary>> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.get()?.survey) return []
      const id = e.identity.get()
      const res = await e.transport.surveysAvailable({
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
      })
      return res.surveys ?? []
    } catch (err) {
      reportError('getAvailableSurveys failed', err)
      return []
    }
  },

  async openSurvey(
    surveyId: string,
    context?: { readonly language?: string; readonly source?: SurveyAttemptSource },
  ): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.get()?.survey) {
        debugLog('openSurvey: survey consent not granted; ignoring')
        return
      }
      e.events.emit('showSurvey', {
        surveyId,
        source: context?.source ?? 'on_demand',
      })
    } catch (err) {
      reportError('openSurvey failed', err)
    }
  },

  setSurveyHandlers(handlers: SurveyHandlers): void {
    surveyHandlers = { ...handlers }
  },

  async handleSurveyDeepLink(url: string): Promise<boolean> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      // Accept URLs of the shape `*://*/s/<token>` or `*survey=<token>`.
      const match = url.match(/\/s\/([A-Za-z0-9._-]+)/) ?? url.match(/[?&]survey=([A-Za-z0-9._-]+)/)
      if (!match || !match[1]) return false
      const token = match[1]
      const id = e.identity.get()
      const resolved = await e.transport.surveyResolveLink({
        token,
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
      })
      if (resolved.consentRequired) {
        debugLog('survey link resolved but consent required — awaiting consent')
        return false
      }
      e.events.emit('showSurvey', { surveyId: resolved.surveyId, source: 'link' })
      return true
    } catch (err) {
      reportError('handleSurveyDeepLink failed', err)
      return false
    }
  },

  // ---------- Non-public / internal ----------

  // Shape is unstable; for tests and debugging only.
  __internal_state(): {
    readonly config: ResolvedConfig | null
    readonly identity: IdentityState | null
    readonly consent: ConsentState | null
    readonly queueSize: number
    readonly triggerCount: number
    readonly frequencyCaps: ReturnType<FrequencyCapManager['snapshot']> | null
    readonly traces: ReturnType<typeof getTraces>
  } {
    return {
      config: engine?.config ?? null,
      identity: engine?.identity.get() ?? null,
      consent: engine?.consent.get() ?? null,
      queueSize: engine?.queue.size() ?? 0,
      triggerCount: engine?.rules.all().length ?? 0,
      frequencyCaps: engine?.caps.snapshot() ?? null,
      traces: getTraces(),
    }
  },

  // Called by <RitmusProvider>.
  __internal_submitResponse(
    response: ResponseEmission,
    triggerEventName: string,
  ): Promise<void> {
    const e = engine
    if (!e) return Promise.resolve()
    return submitResponse(e, response, triggerEventName, trackInternal)
  },
  __internal_events(): EventBus {
    return requireEngine().events
  },
  __internal_theme(): ResolvedTheme | null {
    return engine?.themeOverride ?? null
  },
  __internal_logTrace: logTrace,
  __internal_surveyStore(): SurveyStore | null {
    return surveyStore
  },
  __internal_surveyHandlers(): SurveyHandlers {
    return surveyHandlers
  },
  async __internal_fetchSurvey(surveyId: string, language?: string): Promise<SurveyCampaignWithFlow | null> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      return await e.transport.surveyGet({
        surveyId,
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        ...(language ? { language } : {}),
      })
    } catch (err) {
      reportError('surveyGet failed', err)
      return null
    }
  },
  async __internal_createAttempt(
    surveyId: string,
    source: SurveyAttemptSource,
    language?: string,
  ): Promise<{ attemptId: string; startQuestionId: string; currentQuestionId: string | null; snapshot: SurveyAnswerRecord; resumed: boolean } | null> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      const res = await e.transport.surveyCreateAttempt(surveyId, {
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        source,
        ...(language ? { language } : {}),
        sdkVersion: 'rn-0.1.0',
      })
      return {
        attemptId: res.attemptId,
        startQuestionId: res.startQuestionId,
        currentQuestionId: res.currentQuestionId,
        snapshot: (res.progressSnapshot ?? {}) as unknown as SurveyAnswerRecord,
        resumed: res.resumed,
      }
    } catch (err) {
      reportError('createAttempt failed', err)
      return null
    }
  },
  async __internal_saveProgress(
    attemptId: string,
    currentQuestionId: string | null,
    snapshot: SurveyAnswerRecord,
  ): Promise<void> {
    try {
      const e = requireEngine()
      await e.transport.surveyUpdateProgress(attemptId, {
        currentQuestionId,
        progressSnapshot: snapshot,
      })
    } catch (err) {
      reportError('saveProgress failed', err)
    }
  },
  async __internal_submitAnswers(
    attemptId: string,
    answers: ReadonlyArray<{ questionId: string; value: SurveyAnswerValue }>,
  ): Promise<void> {
    try {
      const e = requireEngine()
      await e.transport.surveySubmitAnswers(attemptId, { answers })
    } catch (err) {
      reportError('submitAnswers failed', err)
    }
  },
  async __internal_completeAttempt(attemptId: string): Promise<void> {
    try {
      const e = requireEngine()
      await e.transport.surveyComplete(attemptId, {})
    } catch (err) {
      reportError('completeAttempt failed', err)
    }
  },
  async __internal_abandonAttempt(attemptId: string): Promise<void> {
    try {
      const e = requireEngine()
      await e.transport.surveyAbandon(attemptId)
    } catch (err) {
      reportError('abandonAttempt failed', err)
    }
  },
} as const

export type RitmusStatic = typeof Ritmus
