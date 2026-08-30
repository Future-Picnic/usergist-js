// UserGist — public singleton facade.
//
// Philosophy:
//  - `init()` remains synchronous and backwards compatible. `initAsync()` can
//    bind a server-proven identity before any lifecycle event is emitted.
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
  JsonAction,
  InAppCtaAction,
} from '@usergist/sdk-core/mobile'
import {
  REQUEST_COMMENTED_EVENT_NAME,
  REQUEST_COMMENT_EDITED_EVENT_NAME,
  REQUEST_COMMENT_DELETED_EVENT_NAME,
} from '@usergist/sdk-core/mobile'
import {
  asEventProps,
  clearAllState,
  createEngine,
  emitAppOpenWhenConsentReady,
  emitAppVersionChanged,
  ensureHydrated,
  enqueueAndEvaluate,
  flushNow,
  flushMutations,
  pollInstructions,
  refreshTargetingRules,
  recordServerBackedEventLocally,
  submitResponse,
  type Engine,
} from './internal/engine.js'
import {
  setDebugEnabled,
  reportError,
  debugLog,
  logTrace,
  getTraces,
  setDiagnosticHandler,
  type SdkDiagnostic,
} from './internal/debug.js'
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
import {
  UserGistPushNative,
  onTokenReceived,
  onNotificationReceived,
  onNotificationOpened,
  onTokenError,
} from './native/push-bridge.js'
import { Push } from './Push.js'
import type { NotificationPayload } from './native/events.js'
import { AppState, Platform } from 'react-native'
import { generateEventId, validateIdentifyTransition } from './internal/identity.js'
import {
  configureStorageAdapter,
  type UserGistStorageAdapter,
} from './internal/storage.js'
import { surveyCompletionOutcome } from './internal/survey-completion.js'

type PromptShownCb = (p: ShowPromptPayload) => void
type ResponseCb = (r: ResponseEmission) => void

interface SurveyHandlers {
  /**
   * Called when a triggered or scheduled survey becomes available for this
   * user. Host app typically renders an invite (banner/toast) and calls
   * `UserGist.openSurvey(surveyId)` to launch the full flow on tap.
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

export type IdentifyResult = 'synced' | 'queued' | 'rejected'

export interface InitialIdentity {
  readonly userId: string
  readonly subjectToken: string
  readonly properties?: Record<string, EventPropertyValue>
}

export interface InAppHandlers {
  readonly onShow?: (messageId: string) => void
  readonly onDismiss?: (messageId: string, reason: 'user' | 'auto') => void
  readonly onCtaClick?: (args: {
    readonly messageId: string
    readonly action: InAppCtaAction
    readonly target?: string
    readonly actionJson?: JsonAction
    readonly label: string
    readonly index: number
  }) => void
  /** Executes host-defined structured actions after the CTA tap is tracked. */
  readonly onJsonAction?: (action: JsonAction, context: {
    readonly source: 'in_app'
    readonly messageId: string
    readonly label: string
    readonly index: number
  }) => void
}

let engine: Engine | null = null
let runtimeStarted = false
let runtimeStartPromise: Promise<void> | null = null
let resetPromise: Promise<void> | null = null
let surveyStore: SurveyStore | null = null
let surveyHandlers: SurveyHandlers = {}
let inAppHandlers: InAppHandlers = {}
let requestsHandlers: import('@usergist/sdk-core/mobile').RequestsHandlers = {}
let requestsCache: ReturnType<
  typeof import('./internal/requests.js').createRequestsCache
> | null = null

function ensureRequestsCache() {
  if (!requestsCache) {
    // Lazy-imported to keep cold-start fast for apps that don't use requests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./internal/requests.js') as typeof import('./internal/requests.js')
    requestsCache = mod.createRequestsCache()
  }
  return requestsCache
}

function requireEngine(): Engine {
  if (!engine) {
    throw new Error('UserGist.init must be called before using the SDK')
  }
  return engine
}

function ensureEngine(config: SdkConfig): Engine {
  if (engine) return engine
  engine = createEngine(config)
  surveyStore = createSurveyStore(config.writeKey)
  return engine
}

async function startRuntime(e: Engine): Promise<void> {
  if (runtimeStarted) return
  if (runtimeStartPromise) return runtimeStartPromise
  runtimeStarted = true
  e.lifecycle.start()
  runtimeStartPromise = (async () => {
    await refreshTargetingRules(e)
    await emitAppVersionChanged(e)
    emitAppOpenWhenConsentReady(e)
    void pollInstructions(e)
  })().finally(() => {
    runtimeStartPromise = null
  })
  return runtimeStartPromise
}

function validateCommentBody(body: unknown): asserts body is string {
  if (
    typeof body !== 'string' ||
    body.trim().length === 0 ||
    body.length > 1000
  ) {
    throw new Error('comment body required, max 1000 chars')
  }
}

// ---------- Native push listener wiring (Phase 7) ----------

let enginePushListenersAttached = false
let lastEnablePushOptions: {
  readonly environment?: 'sandbox' | 'production'
  readonly skipPermissionRequestIfDenied?: boolean
  readonly installDelegateProxy?: boolean
} | null = null
let lastForegroundPushRefreshAt = 0
const FOREGROUND_PUSH_REFRESH_INTERVAL_MS = 5 * 60_000

function defaultEnvironment(): 'sandbox' | 'production' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dev = (globalThis as any).__DEV__
  return dev ? 'sandbox' : 'production'
}

function attachEnginePushListeners(): void {
  if (enginePushListenersAttached) return
  enginePushListenersAttached = true

  // Re-check the push state on every app foreground transition.
  //
  // Why: iOS / Android both let the user flip notification permission in
  // Settings without re-launching the app. Token rotation also happens
  // out-of-band. By re-running enablePush() each time the app becomes
  // active, we catch both. The native side caches its decision so this
  // does NOT re-prompt the user — it just walks the (permission → token →
  // server-register) chain idempotently. No-op if enablePush has never
  // been called.
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return
    if (!lastEnablePushOptions) return
    // This lightweight beacon lets the reachability worker skip unnecessary
    // silent pushes. Token/permission refresh remains throttled separately.
    void UserGist.pushAppOpen()
    const now = Date.now()
    if (now - lastForegroundPushRefreshAt < FOREGROUND_PUSH_REFRESH_INTERVAL_MS) return
    lastForegroundPushRefreshAt = now
    void UserGist.enablePush(lastEnablePushOptions).catch(() => undefined)
  })

  onTokenReceived((p) => {
    void (async () => {
      try {
        const platform = (p.platform === 'ios' ? 'ios' : 'android') as 'ios' | 'android'
        await UserGist.registerPushToken(p.token, platform, {
          environment: lastEnablePushOptions?.environment ?? defaultEnvironment(),
        })
      } catch (err) {
        reportError('tokenReceived registration failed', err)
      }
    })()
  })

  onTokenError((p) => {
    debugLog('push token error', p.error)
  })

  onNotificationReceived((p: NotificationPayload) => {
    forwardToPushHandler(p, 'received')
  })

  onNotificationOpened((p: NotificationPayload) => {
    forwardToPushHandler(p, 'opened')
  })
}

function forwardToPushHandler(p: NotificationPayload, kind: 'received' | 'opened'): void {
  const data = p.data ?? {}
  if (p.deliveryId) {
    ;(data as Record<string, unknown>).usergist_delivery_id = p.deliveryId
  }
  if (Platform.OS === 'ios') {
    const userInfo: Record<string, unknown> = {
      aps: {
        alert: { title: p.title, body: p.body },
      },
      usergist: {
        deliveryId: p.deliveryId,
      },
    }
    Object.assign(userInfo, data)
    if (kind === 'received') {
      Push.handleReceived({ userInfo, notification: { title: p.title, body: p.body } })
    } else {
      Push.handleOpened({ userInfo, actionIdentifier: p.actionIdentifier })
    }
  } else {
    const dataStr: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      dataStr[k] = String(v)
    }
    if (kind === 'received') {
      Push.handleReceived({ data: dataStr, notification: { title: p.title, body: p.body } })
    } else {
      Push.handleOpened({ data: dataStr, actionIdentifier: p.actionIdentifier })
    }
  }
}

function trackInternal(
  name: string,
  props: Readonly<Record<string, EventPropertyValue>>,
  purpose: 'analytics' | 'feedback' = 'analytics',
): void {
  if (!engine) return
  enqueueAndEvaluate(engine, name, props, purpose)
}

export const UserGist = {
  /**
   * Replace AsyncStorage with a host-provided encrypted adapter. Call before
   * `init()`; changing persistence while the SDK is running is rejected.
   */
  setStorageAdapter(adapter: UserGistStorageAdapter): void {
    if (engine) {
      reportError('setStorageAdapter must be called before init')
      return
    }
    configureStorageAdapter(adapter)
  },

  setDiagnosticHandler(handler: ((diagnostic: SdkDiagnostic) => void) | null): void {
    setDiagnosticHandler(handler)
  },

  init(config: SdkConfig): void {
    void UserGist.initAsync(config)
  },

  async initAsync(
    config: SdkConfig,
    initialIdentity?: InitialIdentity,
  ): Promise<IdentifyResult> {
    try {
      const e = ensureEngine(config)
      await ensureHydrated(e)
      if (initialIdentity) {
        const result = await UserGist.identifyAsync(
          initialIdentity.userId,
          initialIdentity.properties,
          initialIdentity.subjectToken,
        )
        if (result !== 'synced') return result
      }
      await startRuntime(e)
      return 'synced'
    } catch (error) {
      reportError('initAsync failed', error)
      return 'rejected'
    }
  },

  identify(
    userId: string,
    properties?: Record<string, EventPropertyValue>,
    subjectToken?: string,
  ): void {
    void UserGist.identifyAsync(userId, properties, subjectToken)
  },

  async identifyAsync(
    userId: string,
    properties?: Record<string, EventPropertyValue>,
    subjectToken?: string,
  ): Promise<IdentifyResult> {
    try {
      if (typeof userId !== 'string' || userId.length === 0) {
        reportError('identify requires a userId string')
        return 'rejected'
      }
      const e = requireEngine()
      await ensureHydrated(e)
      const identity = e.identity.get()
      const pendingIdentity = e.mutations.peek()
      const transition = validateIdentifyTransition(
        identity.externalId,
        pendingIdentity?.kind === 'identify' ? pendingIdentity.payload.externalId : null,
        userId,
      )
      if (transition === 'reset_required') {
        reportError('identify rejected: call reset() before switching users')
        return 'rejected'
      }
      const cleanProps = e.consent.allowsAnalytics() ? asEventProps(properties) : undefined
      if (
        transition === 'already_identified' &&
        (!cleanProps || Object.keys(cleanProps).length === 0)
      ) {
        return 'synced'
      }
      if (!subjectToken || !subjectToken.startsWith('st_')) {
        reportError('identify requires a server-minted subject token')
        return 'rejected'
      }
      const mutationId = await e.mutations.enqueue('identify', 'essential', {
        subjectToken,
        anonymousId: identity.anonymousId,
        externalId: userId,
        ...(cleanProps ? { properties: cleanProps } : {}),
      }, `identify:${userId}`)
      const result = await flushMutations(e)
      if (result.permanentlyRejectedIds.has(mutationId)) {
        reportError('identify was rejected by the server')
        return 'rejected'
      }
      if (e.mutations.has(mutationId)) {
        debugLog('identify is saved locally and pending retry')
        return 'queued'
      }
      void UserGist.rebindPushToken(userId)
      return 'synced'
    } catch (err) {
      reportError('identify failed', err)
      return 'rejected'
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

  async setConsent(purposes: Consent): Promise<boolean> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const next = await e.consent.set(purposes)
      const id = e.identity.get()
      try {
        await e.transport.consent({
          anonymousId: id.anonymousId,
          externalId: id.externalId,
          purposes: {
            analytics: next.analytics,
            feedback: next.feedback,
            push: next.push,
            survey: next.survey,
          },
          version: next.version,
          effectiveAt: next.updatedAt ?? new Date().toISOString(),
        })
      } catch (err) {
        reportError('transport.consent failed', err)
        return false
      }
      if (next.feedback || next.survey) {
        await refreshTargetingRules(e, true)
      }
      if (next.analytics || next.feedback) {
        await flushNow(e)
      }
      return true
    } catch (err) {
      reportError('setConsent failed', err)
      return false
    }
  },

  reset(): Promise<void> {
    try {
      const e = requireEngine()
      if (e.resetting) return resetPromise ?? Promise.resolve()
      e.resetting = true
      e.resetGeneration += 1
      e.events.emit('resetSurfaces', undefined)
      const operation = (async () => {
        await ensureHydrated(e)
        if (e.lastPushToken) await UserGist.invalidatePushToken(e.lastPushToken)
        await UserGistPushNative.disablePush().catch(() => undefined)
        await clearAllState(e)
      })()
      const finalized = operation
        .catch((err: unknown) => reportError('reset failed', err))
        .finally(() => {
          e.resetting = false
          if (resetPromise === finalized) resetPromise = null
        })
      resetPromise = finalized
      return finalized
    } catch (err) {
      reportError('reset failed', err)
      return Promise.resolve()
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

  getExternalId(): string | null {
    try {
      return engine?.identity.get().externalId ?? null
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

  /**
   * Subscribe to push lifecycle events: `$push_received`, `$push_displayed`,
   * `$push_opened`, `$push_dismissed`, `$push_action_clicked`.
   *
   * Each callback receives `(eventName, props)` where `props` carries
   * `{ campaign_id, variant_id, delivery_id, language, action_button? }`.
   *
   * Use this to forward push events to a host-app analytics tool
   * (Amplitude, Mixpanel, Segment, etc.). The SDK is analytics-tool
   * agnostic — you plumb to whatever stack you use.
   *
   * Example:
   *   import { track as amplitudeTrack } from '@amplitude/analytics-react-native'
   *   UserGist.onPushEvent((name, props) => amplitudeTrack(name, props))
   *
   * Returns an unsubscribe fn.
   */
  onPushEvent(
    cb: (name: string, props: Readonly<Record<string, unknown>>) => void,
  ): () => void {
    try {
      return requireEngine().events.on('pushEvent', (p) => cb(p.name, p.props))
    } catch (err) {
      reportError('onPushEvent failed', err)
      return () => {}
    }
  },

  /** SDK-internal: invoked by Push.ts for every $push_* event. */
  _notifyPushEvent(name: string, props: Readonly<Record<string, unknown>>): void {
    try {
      engine?.events.emit('pushEvent', { name, props })
    } catch {
      // Listener errors must never cross the SDK boundary.
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
      if (!e.consent.allowsPush()) return
      // Consent is enforced server-side (the register-token route reads
      // consent_log and refuses if push was explicitly declined). We no
      // longer short-circuit here because the host app typically calls
      // setConsent and registerPushToken in parallel; racing the local
      // consent hydration is not our problem to solve.
      const id = e.identity.get()
      const environment = opts?.environment ??
        (e.config.environment === 'production' ? 'production' : 'sandbox')
      const registrationKey = [
        id.anonymousId,
        id.externalId ?? '',
        platform,
        environment,
        token,
      ].join(':')
      if (
        e.lastPushRegistrationKey === registrationKey &&
        Date.now() - e.lastPushRegistrationAt < 24 * 60 * 60_000
      ) return
      await e.transport.pushRegisterToken({
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        token,
        platform,
        environment,
        language: undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        appVersion: undefined,
        sdkVersion: 'rn-0.1.0',
        optIn: true,
      })
      e.lastPushToken = token
      e.lastPushRegistrationKey = registrationKey
      e.lastPushRegistrationAt = Date.now()
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

  /**
   * Re-bind the latest registered device token to a newly-identified user.
   * Called from inside `identify()` so that subsequent campaign sends to
   * the now-identified user reach this device. No-op when no push token
   * is registered on this device.
   */
  async rebindPushToken(externalId: string): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      const token = e.lastPushToken
      if (!token) return
      await e.transport.pushRebind({
        anonymousId: id.anonymousId,
        externalId,
        token,
      })
    } catch (err) {
      reportError('rebindPushToken failed', err)
    }
  },

  /** SDK-internal: emit a delivery beacon. */
  async pushBeacon(
    kind: 'delivered' | 'displayed' | 'dismissed',
    deliveryId: string,
  ): Promise<void> {
    try {
      if (!deliveryId) return
      const e = requireEngine()
      await ensureHydrated(e)
      const dispatch = {
        delivered: e.transport.pushDelivered,
        displayed: e.transport.pushDisplayed,
        dismissed: e.transport.pushDismissed,
      } as const
      await dispatch[kind]({ deliveryId })
    } catch (err) {
      reportError(`pushBeacon ${kind} failed`, err)
    }
  },

  /** Ack a silent reachability ping. */
  async pushAckSilent(pingId: string): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      await e.transport.pushSilentAck({ pingId, anonymousId: id.anonymousId })
    } catch (err) {
      reportError('pushAckSilent failed', err)
    }
  },

  /** Forward an applicationDidBecomeActive / onResume signal to the server. */
  async pushAppOpen(): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.lastPushToken) return
      const id = e.identity.get()
      await e.transport.pushAppOpen({ anonymousId: id.anonymousId })
    } catch (err) {
      reportError('pushAppOpen failed', err)
    }
  },

  /** Fetch the per-app channel registry. */
  async pushFetchChannels(): Promise<ReadonlyArray<import('@usergist/sdk-core/mobile').PushChannelDef>> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const resp = await e.transport.pushChannelsList()
      return (resp.channels ?? []) as ReadonlyArray<import('@usergist/sdk-core/mobile').PushChannelDef>
    } catch (err) {
      reportError('pushFetchChannels failed', err)
      return []
    }
  },

  async pushSetChannelSubscription(channelId: string, subscribed: boolean): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      await e.transport.pushChannelSubscription({
        anonymousId: id.anonymousId,
        channelId,
        subscribed,
      })
    } catch (err) {
      reportError('pushSetChannelSubscription failed', err)
    }
  },

  // ---------- Self-contained push (Phase 7) ----------
  //
  // `enablePush()` is the single high-level entry point — it acquires the
  // OS-level push permission, fetches the platform token (APNs / FCM)
  // through the bundled native module, and registers the token with the
  // UserGist API. Token-refresh + foreground/background delivery + tap
  // callbacks are wired automatically once any of these are called.
  //
  // Consumers do NOT need @react-native-firebase/messaging,
  // react-native-onesignal, WonderPush, or any other push SDK.

  async enablePush(opts?: {
    readonly environment?: 'sandbox' | 'production'
    readonly skipPermissionRequestIfDenied?: boolean
    readonly installDelegateProxy?: boolean
  }): Promise<{
    readonly granted: boolean
    readonly status: 'authorized' | 'provisional' | 'denied' | 'not_determined'
    readonly token?: string
    readonly platform: 'ios' | 'android'
  }> {
    try {
      if (!enginePushListenersAttached) attachEnginePushListeners()
      // Snapshot the caller's options so the AppState foreground listener
      // can re-run enablePush idempotently with the same environment.
      lastEnablePushOptions = {
        environment: opts?.environment,
        skipPermissionRequestIfDenied: opts?.skipPermissionRequestIfDenied,
        installDelegateProxy: opts?.installDelegateProxy,
      }
      const result = await UserGistPushNative.enablePush(opts ?? {})
      // Server-side registration runs on the tokenReceived event; if the
      // native module already had a cached token it surfaces here.
      if (result.granted && result.token) {
        const platform = (result.platform === 'ios' ? 'ios' : 'android') as 'ios' | 'android'
        await UserGist.registerPushToken(result.token, platform, {
          environment: opts?.environment ?? (defaultEnvironment()),
        })
      }
      return result as Awaited<ReturnType<typeof UserGist.enablePush>>
    } catch (err) {
      reportError('enablePush failed', err)
      return {
        granted: false,
        status: 'denied',
        platform: (typeof navigator === 'object' && (navigator as { product?: string }).product === 'ReactNative' ? 'ios' : 'android') as 'ios' | 'android',
      }
    }
  },

  async disablePush(): Promise<void> {
    try {
      const e = engine
      if (e?.lastPushToken) await UserGist.invalidatePushToken(e.lastPushToken)
      await UserGistPushNative.disablePush()
      if (e) {
        e.lastPushToken = null
        e.lastPushRegistrationKey = null
        e.lastPushRegistrationAt = 0
        void UserGist.setConsent({ push: false })
      }
    } catch (err) {
      reportError('disablePush failed', err)
    }
  },

  async getPushPermissionStatus(): Promise<
    'authorized' | 'provisional' | 'denied' | 'not_determined'
  > {
    try {
      return await UserGistPushNative.getPermissionStatus()
    } catch (err) {
      reportError('getPushPermissionStatus failed', err)
      return 'not_determined'
    }
  },

  async setPushBadgeCount(count: number): Promise<void> {
    try {
      await UserGistPushNative.setBadgeCount(count)
    } catch (err) {
      reportError('setPushBadgeCount failed', err)
    }
  },

  async getInitialPushNotification(): Promise<NotificationPayload | null> {
    try {
      return await UserGistPushNative.getInitialNotification()
    } catch (err) {
      reportError('getInitialPushNotification failed', err)
      return null
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
        ...(context?.language ? { language: context.language } : {}),
      })
    } catch (err) {
      reportError('openSurvey failed', err)
    }
  },

  setSurveyHandlers(handlers: SurveyHandlers): void {
    surveyHandlers = { ...handlers }
  },

  setInAppHandlers(handlers: InAppHandlers): void {
    inAppHandlers = { ...handlers }
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

  // Called by <UserGistProvider>.
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
  __internal_inAppHandlers(): InAppHandlers {
    return inAppHandlers
  },

  __internal_surveyHandlers(): SurveyHandlers {
    return surveyHandlers
  },

  __internal_reportSurveyShown(surveyId: string): void {
    try {
      const e = requireEngine()
      e.surveyMatcher.recordShown(surveyId)
    } catch (err) {
      reportError('reportSurveyShown failed', err)
    }
  },
  __internal_armedSurveyById(surveyId: string): SurveyCampaignWithFlow | null {
    // Local-fire fast-path. If the survey-rules-cache already has the
    // full survey content (because the matcher just fired), the
    // Provider can render without a /v1/sdk/surveys/:id roundtrip.
    try {
      const e = engine
      if (!e) return null
      const armed = e.surveyRules.getById(surveyId)
      return armed?.survey ?? null
    } catch {
      return null
    }
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
      // Give a previously deferred completion a chance to reach the server
      // before asking it to create or resume another attempt.
      await flushMutations(e)
      const id = e.identity.get()
      const res = await e.transport.surveyCreateAttempt(surveyId, {
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        source,
        ...(language ? { language } : {}),
        sdkVersion: 'rn-0.1.0',
      })
      await surveyStore?.upsert({
        surveyId,
        attemptId: res.attemptId,
        startedAt: Date.now(),
        currentQuestionId: res.currentQuestionId,
        snapshot: (res.progressSnapshot ?? {}) as unknown as SurveyAnswerRecord,
        language: language ?? null,
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
    // Persist the resume point before attempting the network. Progress is
    // best-effort transport; losing connectivity must not lose local answers.
    await surveyStore?.updateProgress(attemptId, currentQuestionId, snapshot)
    try {
      const e = requireEngine()
      await e.transport.surveyUpdateProgress(attemptId, {
        currentQuestionId,
        progressSnapshot: snapshot,
      })
    } catch (err) {
      // Completion can win a race with an in-flight progress PATCH, making a
      // server-side 404 harmless. Keep this out of React Native's LogBox.
      debugLog('survey progress delivery deferred', {
        attemptId,
        reason: err instanceof Error ? err.message : String(err),
      })
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
  async __internal_completeAttempt(
    attemptId: string,
    finalAnswers: ReadonlyArray<{ questionId: string; value: SurveyAnswerValue }> = [],
  ): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (e.resetting) throw new Error('Survey submission cancelled by reset')
      const resetGeneration = e.resetGeneration
      const mutationId = await e.mutations.enqueue('survey-complete', 'survey', {
        attemptId,
        body: { finalAnswers },
      }, `survey-complete:${attemptId}`)
      const result = await flushMutations(e)
      if (e.resetting || e.resetGeneration !== resetGeneration) {
        throw new Error('Survey submission cancelled by reset')
      }
      const outcome = surveyCompletionOutcome(mutationId, e.mutations, result)
      if (outcome === 'rejected') {
        throw new Error('Survey submission was rejected by the server')
      }
      if (outcome === 'deferred') {
        debugLog('survey completion saved locally; delivery deferred', { attemptId })
      }
      // Once the completion is durably queued, the attempt must not reopen as
      // resumable work. The mutation queue owns delivery from this point.
      await surveyStore?.remove(attemptId)
    } catch (err) {
      reportError('completeAttempt failed', err)
      throw err
    }
  },
  async __internal_abandonAttempt(attemptId: string): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const mutationId = await e.mutations.enqueue(
        'survey-abandon',
        'survey',
        { attemptId },
        `survey-abandon:${attemptId}`,
      )
      // The modal is already closed. Remove the local resume card now while
      // the durable mutation queue keeps retrying the server transition.
      await surveyStore?.remove(attemptId)
      const result = await flushMutations(e)
      if (result.permanentlyRejectedIds.has(mutationId)) {
        reportError('abandonAttempt was rejected by the server')
      }
    } catch (err) {
      reportError('abandonAttempt failed', err)
    }
  },

  // ============================================================
  // Feature requests (5th pillar)
  // ============================================================
  // Consent decision: feature-request engagement maps onto the existing
  // `feedback` consent purpose. No new consent migration required.

  async getRequests(
    options: import('@usergist/sdk-core/mobile').GetRequestsOptions = {},
  ): Promise<import('@usergist/sdk-core/mobile').GetRequestsResult> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      const id = e.identity.get()
      const result = await e.transport.requestsList({
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        sort: options.sort,
        statuses: options.statuses,
        mine: options.mine,
        q: options.q,
        cursor: options.cursor ?? null,
        limit: options.limit,
      })
      ensureRequestsCache().upsertList(
        result.items.map((s) => ({
          id: s.id,
          appId: '',
          title: s.title,
          description: s.description,
          status: s.status,
          devResponse: null,
          upvoteCount: s.upvoteCount,
          followerCount: s.followerCount,
          createdAt: s.createdAt,
          updatedAt: s.createdAt,
          statusChangedAt: s.statusChangedAt,
          lastRespondedAt: null,
          viewerHasUpvoted: s.viewerHasUpvoted,
          viewerIsFollowing: s.viewerIsFollowing,
          viewerIsSubmitter: false,
        })),
      )
      return result
    } catch (err) {
      reportError('getRequests failed', err)
      return { items: [], nextCursor: null }
    }
  },

  submitRequest(
    title: string,
    description: string,
    callback?: (
      err: Error | null,
      req?: import('@usergist/sdk-core/mobile').Request,
    ) => void,
  ): void {
    try {
      const e = requireEngine()
      if (typeof title !== 'string' || title.length === 0 || title.length > 120) {
        callback?.(new Error('title required, max 120 chars'))
        return
      }
      if (
        typeof description !== 'string' ||
        description.length === 0 ||
        description.length > 1500
      ) {
        callback?.(new Error('description required, max 1500 chars'))
        return
      }
      void (async () => {
        try {
          await ensureHydrated(e)
          if (!e.consent.allowsFeedback()) {
            callback?.(new Error('feedback consent required'))
            return
          }
          const id = e.identity.get()
          const req = await e.transport.requestSubmit({
            idempotencyKey: generateEventId(),
            anonymousId: id.anonymousId,
            externalId: id.externalId ?? null,
            title,
            description,
          })
          ensureRequestsCache().upsert(req)
          recordServerBackedEventLocally(e, '$request_submitted')
          requestsHandlers.onSubmit?.(req)
          callback?.(null, req)
        } catch (err) {
          callback?.(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    } catch (err) {
      reportError('submitRequest failed', err)
      callback?.(err instanceof Error ? err : new Error(String(err)))
    }
  },

  async voteOnRequest(requestId: string, vote: boolean): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return
      const cache = ensureRequestsCache()
      const rollback = cache.applyOptimisticVote(requestId, vote)
      try {
        const id = e.identity.get()
        const result = await e.transport.requestVote({
          requestId,
          anonymousId: id.anonymousId,
          externalId: id.externalId ?? null,
          vote,
        })
        cache.commitVote(requestId, result)
        recordServerBackedEventLocally(e, vote ? '$request_upvoted' : '$request_unupvoted')
        requestsHandlers.onVote?.(result)
      } catch (err) {
        rollback()
        throw err
      }
    } catch (err) {
      reportError('voteOnRequest failed', err)
    }
  },

  async followRequest(requestId: string, follow: boolean): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return
      const cache = ensureRequestsCache()
      const rollback = cache.applyOptimisticFollow(requestId, follow)
      try {
        const id = e.identity.get()
        const result = await e.transport.requestFollow({
          requestId,
          anonymousId: id.anonymousId,
          externalId: id.externalId ?? null,
          follow,
        })
        cache.commitFollow(requestId, result)
        recordServerBackedEventLocally(e, follow ? '$request_followed' : '$request_unfollowed')
        requestsHandlers.onFollow?.(result)
      } catch (err) {
        rollback()
        throw err
      }
    } catch (err) {
      reportError('followRequest failed', err)
    }
  },

  /**
   * Fetch the per-app branding the dashboard configured for this pillar
   * (entry label, accent color, logo URL, intro copy). Host apps use
   * this to theme the requests UI so it matches the rest of the product
   * without hard-coding colors. Cached for 60s at the edge.
   */
  async getRequestBranding(): Promise<{
    entryLabel: string
    accentColor: string | null
    logoUrl: string | null
    introCopy: string | null
  } | null> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return null
      return await e.transport.requestBranding()
    } catch (err) {
      reportError('getRequestBranding failed', err)
      return null
    }
  },

  /**
   * Fetch a single request by id with full detail (description, dev
   * response, viewer flags). The list endpoint returns a `RequestSummary`
   * that intentionally omits `devResponse` to keep payloads small —
   * call this when rendering a detail view that needs the response.
   */
  async getRequest(
    requestId: string,
  ): Promise<import('@usergist/sdk-core/mobile').Request | null> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return null
      const id = e.identity.get()
      const req = await e.transport.requestGet({
        requestId,
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
      })
      ensureRequestsCache().upsert(req)
      return req
    } catch (err) {
      reportError('getRequest failed', err)
      return null
    }
  },

  openRequestsBoard(): void {
    try {
      const e = requireEngine()
      if (!e.consent.allowsFeedback()) return
      e.events.emit('showRequestsBoard', undefined)
    } catch (err) {
      reportError('openRequestsBoard failed', err)
    }
  },

  openRequestDetail(requestId: string): void {
    try {
      const e = requireEngine()
      if (!e.consent.allowsFeedback()) return
      e.events.emit('showRequestDetail', { requestId })
    } catch (err) {
      reportError('openRequestDetail failed', err)
    }
  },

  setRequestsHandlers(handlers: import('@usergist/sdk-core/mobile').RequestsHandlers): void {
    requestsHandlers = { ...handlers }
  },

  // ---------- comments ----------

  /** List comments for a request, ordered oldest-first. */
  async getComments(
    requestId: string,
  ): Promise<ReadonlyArray<import('@usergist/sdk-core/mobile').RequestComment>> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return []
      const id = e.identity.get()
      const result = await e.transport.requestCommentsList({
        requestId,
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
      })
      return result.items
    } catch (err) {
      reportError('getComments failed', err)
      return []
    }
  },

  /** Post a comment on a request. Returns the new row, or null on failure. */
  async postComment(
    requestId: string,
    body: string,
  ): Promise<import('@usergist/sdk-core/mobile').RequestComment | null> {
    try {
      const e = requireEngine()
      validateCommentBody(body)
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return null
      const id = e.identity.get()
      const comment = await e.transport.requestCommentPost({
        idempotencyKey: generateEventId(),
        requestId,
        anonymousId: id.anonymousId,
        externalId: id.externalId ?? null,
        body,
      })
      recordServerBackedEventLocally(e, REQUEST_COMMENTED_EVENT_NAME)
      return comment
    } catch (err) {
      reportError('postComment failed', err)
      return null
    }
  },

  /** Edit one of the viewer's own comments. Server returns 404 if not theirs. */
  async editComment(
    requestId: string,
    commentId: string,
    body: string,
  ): Promise<import('@usergist/sdk-core/mobile').RequestComment | null> {
    try {
      const e = requireEngine()
      validateCommentBody(body)
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return null
      const id = e.identity.get()
      const comment = await e.transport.requestCommentEdit({
        requestId,
        commentId,
        anonymousId: id.anonymousId,
        body,
      })
      recordServerBackedEventLocally(e, REQUEST_COMMENT_EDITED_EVENT_NAME)
      return comment
    } catch (err) {
      reportError('editComment failed', err)
      return null
    }
  },

  /** Delete one of the viewer's own comments. */
  async deleteComment(requestId: string, commentId: string): Promise<void> {
    try {
      const e = requireEngine()
      await ensureHydrated(e)
      if (!e.consent.allowsFeedback()) return
      const id = e.identity.get()
      await e.transport.requestCommentDelete({
        requestId,
        commentId,
        anonymousId: id.anonymousId,
      })
      recordServerBackedEventLocally(e, REQUEST_COMMENT_DELETED_EVENT_NAME)
    } catch (err) {
      reportError('deleteComment failed', err)
    }
  },
} as const

export type UserGistStatic = typeof UserGist
