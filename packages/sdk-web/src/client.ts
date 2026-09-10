import { userPropertiesUpdateSchema } from '@usergist/sdk-core'
import type {
  ApiResponse,
  Consent,
  CreateSurveyAttemptResponse,
  GetRequestsResult,
  Request as RequestDto,
  RequestComment,
  RequestFollow,
  RequestVote,
  SurveyAnswerRecord,
  SurveyCampaignWithFlow,
  SurveySummary,
  SdkIngestRequest,
} from '@usergist/sdk-core/client'
import { WebStore } from './storage.js'
import { WebRenderer, el, safeUrl, type RenderExperience } from './renderer.js'
import type {
  Diagnostic,
  IdentifyResult,
  OpenResult,
  PersistedWork,
  Properties,
  RuntimeSnapshot,
  RuntimeState,
  WebSdkConfig,
  RequestMutationResult,
} from './types.js'

const VERSION = '0.1.0'
const PII = new Set(['email', 'phone', 'ssn', 'tax_id'])
export class WebSdkError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'SDK_ERROR',
  ) {
    super(message)
  }
}
function uuid() {
  return crypto.randomUUID()
}
function clean(properties?: Properties, max = 100): Properties {
  return Object.fromEntries(
    Object.entries(properties ?? {})
      .filter(
        ([key, value]) =>
          !PII.has(key.toLowerCase()) &&
          key.length <= 120 &&
          (value === null ||
            typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value)) ||
            (typeof value === 'string' && value.length <= 10000)),
      )
      .slice(0, max),
  )
}
function validText(value: string, max: number, label: string) {
  const text = value.trim()
  if (!text || text.length > max)
    throw new WebSdkError(`${label} must contain 1–${max} characters`)
  return text
}
function scope(value: string) {
  return encodeURIComponent(value)
}
export class UserGistClient {
  private config?: WebSdkConfig
  private state: RuntimeState = 'inactive'
  private token: string | null = null
  private externalId: string | null = null
  private anonymousId: string | null = null
  private clientId: string | null = null
  private consent: Consent = {}
  private consentVersion = 0
  private store?: WebStore
  private queue: PersistedWork[] = []
  private writes: Promise<void> = Promise.resolve()
  private flushing?: Promise<void>
  private mutationResults = new Map<
    string,
    { delivered?: boolean; result?: unknown; error?: unknown }
  >()
  private activating?: Promise<IdentifyResult>
  private generation = 0
  private requests = new Set<AbortController>()
  private renderer?: WebRenderer
  private timer?: ReturnType<typeof setTimeout>
  private screenName = ''
  private polling = false
  private inboxCursor = 0
  private opening = false
  private refreshing?: Promise<void>
  private consentDirty = false
  private resetWork?: Promise<void>
  private credentialKey?: string
  private instanceKey?: string
  private listeners = new Set<() => void>()
  private events = new Map<string, Set<(value: any) => void>>()
  private channel?: BroadcastChannel
  private retryAt = 0
  private snapshot: RuntimeSnapshot = {
    state: 'inactive',
    externalId: null,
    anonymousId: null,
    clientId: null,
    consent: {},
    queueSize: 0,
    screenName: '',
  }
  private visibility = () => {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible'
    )
      this.schedule(0)
  }
  private online = () => this.schedule(0)
  private diagnostic(code: string, message: string) {
    const value: Diagnostic = { code, message, at: new Date().toISOString() }
    try {
      this.config?.onDiagnostic?.(value)
    } catch {}
    this.emit('diagnostic', value)
    if (this.config?.debug) console.info(`[UserGist:${code}] ${message}`)
  }
  private changed() {
    this.snapshot = {
      state: this.state,
      externalId: this.externalId,
      anonymousId: this.anonymousId,
      clientId: this.clientId,
      consent: { ...this.consent },
      queueSize: this.queue.length,
      screenName: this.screenName,
    }
    for (const listener of this.listeners) listener()
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  on(event: string, listener: (value: any) => void) {
    const set = this.events.get(event) ?? new Set()
    set.add(listener)
    this.events.set(event, set)
    return () => {
      set.delete(listener)
    }
  }
  private emit(event: string, value: unknown) {
    for (const listener of this.events.get(event) ?? [])
      try {
        listener(value)
      } catch {
        if (event !== 'diagnostic')
          this.diagnostic('handler_error', `The ${event} handler failed`)
      }
  }
  private get active() {
    return (
      this.state === 'active-identified' || this.state === 'active-anonymous'
    )
  }
  async init(config: WebSdkConfig): Promise<void> {
    if (!config.writeKey) throw new WebSdkError('A write key is required')
    if (this.state === 'destroyed')
      throw new WebSdkError('Create a new client after destroy()')
    if (this.config) {
      if (this.config.writeKey !== config.writeKey)
        throw new WebSdkError('Create a separate client for another app')
      return
    }
    this.config = {
      ...config,
      apiUrl: (config.apiUrl ?? 'https://api.usergist.com').replace(/\/$/, ''),
    }
    // Intentionally no storage, identity, timers, DOM, or network here.
    this.changed()
  }
  private async api<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    refresh = true
  ): Promise<T> {
    if (!this.config) throw new WebSdkError('Initialize UserGist first')
    if (path === '/v1/sdk/ingest' && body) {
      const batch = body as SdkIngestRequest
      if (batch.delivery) {
        // Client registration can change after a reload, identify or 401
        // refresh. Event identity is immutable; presentation uses this tab now.
        body = {
          ...batch,
          delivery: this.clientId
            ? { ...batch.delivery, clientId: this.clientId, screenName: this.screenName }
            : undefined,
        }
      }
    }
    const generation = this.generation
    const controller = new AbortController()
    this.requests.add(controller)
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${this.config.apiUrl}${path}`, {
        method,
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.writeKey}`,
          'Content-Type': 'application/json',
          ...(this.token ? { 'X-UserGist-Subject-Token': this.token } : {}),
          ...(this.clientId ? { 'X-UserGist-Client-Id': this.clientId } : {}),
          'X-UserGist-SDK': 'web/' + VERSION,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (generation !== this.generation)
        throw new WebSdkError('Session changed', 0, 'SESSION_CHANGED')
      if (
        response.status === 401 &&
        refresh &&
        this.externalId &&
        this.config.getSubjectToken
      ) {
        await this.refreshIdentity()
        return this.api<T>(path, body, method, false)
      }
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'))
        this.retryAt =
          Date.now() +
          (Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 60)) : 30) *
            1000
      }
      const result = (await response.json()) as ApiResponse<T>
      if (generation !== this.generation)
        throw new WebSdkError('Session changed', 0, 'SESSION_CHANGED')
      if (!response.ok || !result.success) {
        if (response.status === 401 && this.active) {
          this.state = 'authentication-required'
          this.renderer?.close(false)
          this.changed()
        }
        throw new WebSdkError(
          result.error?.message ?? 'Request failed',
          response.status,
          result.error?.code
        )
      }
      return result.data as T
    } finally {
      clearTimeout(timeout)
      this.requests.delete(controller)
    }
  }
  private refreshIdentity() {
    return (this.refreshing ??= this.performRefreshIdentity().finally(() => {
      this.refreshing = undefined
    }))
  }
  private async performRefreshIdentity() {
    const id = this.externalId
    const generation = this.generation
    if (!id || !this.config?.getSubjectToken)
      throw new WebSdkError('Sign in again', 401)
    const token = await this.config.getSubjectToken(id)
    if (generation !== this.generation) throw new WebSdkError('Session changed')
    this.token = token
    this.clientId = null
    await this.api('/v1/sdk/identify', { ...this.identity() }, 'POST', false)
    await this.registerClient()
    this.state = 'active-identified'
    this.changed()
  }
  identify(
    userId: string,
    properties?: Properties,
    subjectToken?: string
  ): Promise<IdentifyResult> {
    if (this.activating) return this.activating
    return (this.activating = this.activate(
      userId,
      properties,
      subjectToken
    ).finally(() => {
      this.activating = undefined
    }))
  }
  async startAnonymous(): Promise<IdentifyResult> {
    if (!this.config?.allowAnonymous) {
      this.diagnostic(
        'anonymous_disabled',
        'Enable allowAnonymous before starting an anonymous session'
      )
      return 'rejected'
    }
    return this.identify('')
  }
  private async activate(
    userId: string,
    properties?: Properties,
    subjectToken?: string
  ): Promise<IdentifyResult> {
    if (this.resetWork) await this.resetWork
    if (!this.config || this.state === 'destroyed') return 'rejected'
    if (this.active) {
      if (
        this.externalId === userId ||
        (userId === '' && this.externalId === null)
      )
        return 'synced'
      if (this.externalId) {
        this.diagnostic(
          'reset_required',
          'Call reset() before switching accounts'
        )
        return 'rejected'
      }
    }
    if (!userId && !this.config.allowAnonymous) return 'rejected'
    const generation = this.generation
    const previousQueue = this.externalId === null ? [...this.queue] : []
    const assertCurrent = () => {
      if (generation !== this.generation)
        throw new WebSdkError('Session changed', 0, 'SESSION_CHANGED')
    }
    let tabId = ''
    try {
      tabId = sessionStorage.getItem('usergist:tab') ?? uuid()
      sessionStorage.setItem('usergist:tab', tabId)
    } catch {
      tabId = uuid()
    }
    const namespace = `${scope(this.config.writeKey)}:${
      this.config.environment ?? 'production'
    }:${encodeURIComponent(userId || 'anonymous')}:${tabId}`
    this.state = 'activating'
    this.channel?.close()
    this.channel = undefined
    this.renderer?.destroy()
    this.renderer = undefined
    this.changed()
    try {
      this.credentialKey = `usergist:${namespace}:credential`
      this.store = new WebStore(namespace, (message) =>
        this.diagnostic('storage_fallback', message)
      )
      // Preserve explicitly activated anonymous history when it is identified.
      const alias =
        this.anonymousId ?? (await this.store.get<string>('alias')) ?? uuid()
      assertCurrent()
      this.anonymousId = alias
      await this.store.set('alias', this.anonymousId)
      assertCurrent()
      this.externalId = userId || null
      this.clientId = null
      if (userId) {
        const token =
          subjectToken ?? (await this.config.getSubjectToken?.(userId)) ?? null
        assertCurrent()
        this.token = token
        if (!this.token)
          throw new WebSdkError(
            'identify() requires a server-minted subject token'
          )
        await this.api(
          '/v1/sdk/identify',
          { ...this.identity(), properties: clean(properties) },
          'POST',
          false
        )
      } else {
        let saved: string | null = null
        try {
          saved = sessionStorage.getItem(this.credentialKey)
        } catch {}
        this.token = saved
        const session = await this.api<{ subjectToken: string }>(
          '/v1/sdk/session',
          { anonymousId: this.anonymousId },
          'POST',
          false
        )
        assertCurrent()
        this.token = session.subjectToken
        try {
          sessionStorage.setItem(this.credentialKey, this.token)
        } catch {}
      }
      if (generation !== this.generation) return 'rejected'
      await this.registerClient()
      const savedQueue = (await this.store.get<PersistedWork[]>('queue')) ?? []
      assertCurrent()
      this.queue = [
        ...new Map(
          [...savedQueue, ...previousQueue].map((work) => [work.id, work])
        ).values(),
      ].filter((work) => Date.now() - work.createdAt < 7 * 86400000)
      this.state = userId ? 'active-identified' : 'active-anonymous'
      this.consentDirty = true
      await this.sendConsent()
      if (generation !== this.generation) return 'rejected'
      document.addEventListener('visibilitychange', this.visibility)
      window.addEventListener('online', this.online)
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(
          `usergist:${scope(this.config.writeKey)}:${encodeURIComponent(
            userId || 'anonymous',
          )}`
        )
        this.channel.onmessage = (e) => {
          if (e.data === 'reset') void this.reset(false)
        }
      }
      this.changed()
      this.mountLauncher()
      this.track('$app_open')
      this.schedule(0)
      this.emit('activated', this.snapshot)
      return 'synced'
    } catch (error) {
      if (generation === this.generation) {
        this.state = 'inactive'
        this.token = null
        this.clientId = null
        this.externalId = null
        this.changed()
      }
      this.diagnostic(
        'activation_failed',
        error instanceof Error ? error.message : 'Activation failed'
      )
      return 'rejected'
    }
  }
  private async registerClient() {
    let instanceId: string = uuid()
    try {
      const key = `usergist:instance:${scope(this.config!.writeKey)}:${
        this.externalId ?? this.anonymousId
      }`
      this.instanceKey = key
      instanceId = sessionStorage.getItem(key) ?? instanceId
      sessionStorage.setItem(key, instanceId)
    } catch {}
    const result = await this.api<{ clientId: string }>(
      '/v1/sdk/clients',
      {
        anonymousId: this.anonymousId,
        instanceId,
        platform: 'web',
        sdkVersion: VERSION,
        protocolVersion: 2,
        capabilities: ['personalization.v1'],
        screenName: this.screenName,
      },
      'POST',
      false
    )
    this.clientId = result.clientId
  }
  private identity() {
    return { anonymousId: this.anonymousId!, externalId: this.externalId }
  }
  async setConsent(consent: Consent): Promise<boolean> {
    this.consent = { ...this.consent, ...consent, push: false }
    this.consentVersion = Date.now()
    this.consentDirty = true
    this.queue = this.queue.filter(
      (work) => this.consent[work.purpose] === true
    )
    const displayedPurpose = this.renderer?.consentPurpose
    if (displayedPurpose && !this.consent[displayedPurpose])
      this.renderer?.close(false)
    this.changed()
    this.mountLauncher()
    if (!this.active) return true
    await this.persist()
    try {
      await this.sendConsent()
      this.schedule(0)
      return true
    } catch (error) {
      this.diagnostic(
        'consent_sync_failed',
        error instanceof Error ? error.message : 'Consent sync failed'
      )
      return false
    }
  }
  private async sendConsent() {
    const version = this.consentVersion
    await this.api('/v1/sdk/consent', {
      ...this.identity(),
      purposes: this.consent,
      version,
      effectiveAt: new Date().toISOString(),
    })
    if (version === this.consentVersion) this.consentDirty = false
  }
  async setUserProperties(
    properties: Properties,
    unset: readonly string[] = []
  ): Promise<void> {
    if (!this.active || !this.consent.analytics)
      throw new WebSdkError('Activate a user and grant analytics consent first')
    const update = userPropertiesUpdateSchema.parse({
      mutationId: uuid(),
      set: properties,
      unset: [...unset],
    })
    await this.enqueue(
      '/v1/sdk/user-properties',
      { ...update, anonymousId: this.anonymousId },
      'analytics'
    )
    await this.flush()
  }
  track(eventName: string, properties?: Properties): void {
    if (!this.active || !this.consent.analytics) {
      this.diagnostic(
        'track_inactive',
        'Event ignored: activate a user and grant analytics consent first'
      )
      return
    }
    if (!eventName || eventName.length > 120) {
      this.diagnostic(
        'invalid_event',
        'Event names must contain 1–120 characters'
      )
      return
    }
    const eventId = uuid()
    const identity = this.identity()
    const context = {
      ...identity,
      sdkVersion: VERSION,
      platform: 'web',
      appVersion: this.config?.appVersion,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    void this.enqueue(
      '/v1/sdk/ingest',
      {
        events: [
          {
            eventId,
            name: eventName,
            timestamp: new Date().toISOString(),
            ...identity,
            properties: {
              ...clean(properties, this.screenName ? 99 : 100),
              ...(this.screenName ? { screen_name: this.screenName } : {}),
            },
            platform: 'web',
            sdkVersion: VERSION,
          },
        ],
        context,
        ...(this.clientId
          ? {
              delivery: {
                eventIds: [eventId],
                clientId: this.clientId,
                screenName: this.screenName,
              },
            }
          : {}),
      },
      'analytics'
    ).catch((error) => this.diagnostic('queue_failed', error.message))
  }
  setPageContext(context: { screenName: string }) {
    this.screenName = context.screenName.slice(0, 120)
    this.changed()
    this.schedule(0)
  }
  private async persist() {
    await this.store?.set('queue', this.queue)
    this.changed()
  }
  private enqueue(
    path: string,
    body: unknown,
    purpose: PersistedWork['purpose'],
    method = 'POST'
  ): Promise<void> {
    const generation = this.generation
    const write = this.writes.then(async () => {
      if (
        generation !== this.generation ||
        !this.active ||
        !this.consent[purpose]
      )
        throw new WebSdkError('Participation or consent changed')
      if (this.queue.length >= (this.config?.maxQueueSize ?? 500))
        throw new WebSdkError('The pending queue is full. Reconnect and retry.')
      this.queue.push({
        id: uuid(),
        path,
        body: structuredClone(body),
        purpose,
        method,
        createdAt: Date.now(),
      })
      await this.persist()
      this.schedule(0)
    })
    this.writes = write.catch(() => {})
    return write
  }
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing
    return (this.flushing = this.flushWork().finally(() => {
      this.flushing = undefined
    }))
  }
  private async flushWork() {
    await this.writes
    if (!this.active || Date.now() < this.retryAt) return
    if (this.consentDirty) await this.sendConsent()
    const generation = this.generation
    while (generation === this.generation && this.active) {
      await this.writes
      const item = this.queue.find((work) => this.consent[work.purpose])
      if (!item) break
      if (generation !== this.generation || !this.active) return
      try {
        const result = await this.api(item.path, item.body, item.method)
        if (generation !== this.generation || !this.active) return
        if (item.path === '/v1/sdk/ingest') {
          const instructions =
            (
              result as {
                instructions?: Array<{
                  id: number
                  type: string
                  payload: Record<string, any>
                }>
              }
            ).instructions ?? []
          for (const instruction of instructions) {
            if (
              generation !== this.generation ||
              document.visibilityState !== 'visible'
            )
              break
            const p = instruction.payload
            const pillar =
              instruction.type === 'prompt.show'
                ? 'feedback'
                : instruction.type === 'survey.offer'
                ? 'survey'
                : instruction.type === 'inapp.show'
                ? 'inapp'
                : null
            const id =
              p.campaignId ??
              p.promptId ??
              p.surveyId ??
              p.message?.messageId
            if (pillar && typeof id === 'string' && p.authorized)
              await this.openExperience(
                pillar,
                id,
                instruction.id,
                undefined,
                p.authorized
              )
          }
        }
        if (
          item.path === '/v1/sdk/user-properties' &&
          (result as { filteredKeys?: string[] })?.filteredKeys?.length
        )
          this.diagnostic(
            'properties_filtered',
            `App privacy settings filtered: ${(
              result as { filteredKeys: string[] }
            ).filteredKeys.join(', ')}`
          )
        const outcome = this.mutationResults.get(item.id)
        if (outcome) Object.assign(outcome, { delivered: true, result })
      } catch (error) {
        this.diagnostic(
          'delivery_failed',
          error instanceof Error
            ? error.message
            : 'Unable to deliver pending work'
        )
        if (
          !(error instanceof WebSdkError) ||
          error.status === 0 ||
          error.status === 401 ||
          error.status === 429 ||
          error.status >= 500
        ) {
          this.retryAt = Math.max(this.retryAt, Date.now() + 5000)
          break
        }
        const outcome = this.mutationResults.get(item.id)
        if (outcome) outcome.error = error
      }
      if (generation !== this.generation) return
      this.queue = this.queue.filter((work) => work.id !== item.id)
      await this.persist()
    }
  }
  private schedule(delay = this.config?.flushIntervalMs ?? 5000) {
    if (this.timer) clearTimeout(this.timer)
    if (!this.active) return
    this.timer = setTimeout(() => {
      void this.tick()
    }, Math.max(delay, this.retryAt - Date.now()))
  }
  private async tick() {
    try {
      if (!this.active) return
      await this.flush()
      if (document.visibilityState === 'visible') await this.poll()
    } catch (error) {
      this.diagnostic(
        'sync_failed',
        error instanceof Error ? error.message : 'Unable to sync'
      )
    } finally {
      this.schedule()
    }
  }
  private async poll() {
    if (
      this.polling ||
      !this.clientId ||
      this.renderer?.isOpen ||
      !this.active ||
      (!this.consent.feedback && !this.consent.survey)
    )
      return
    this.polling = true
    const generation = this.generation
    try {
      // Bound each tick, retaining a cursor only until this pass is exhausted.
      // Restarting each pass lets earlier instructions become eligible again.
      for (let page = 0; page < 5; page++) {
        const result = await this.api<{
          instructions: Array<{
            id: number
            type: string
            payload: Record<string, any>
          }>
          nextCursor?: number | null
        }>(
          `/v1/sdk/clients/${this.clientId}/instructions?after=${this.inboxCursor}`
        )
        for (const instruction of result.instructions) {
          if (
            generation !== this.generation ||
            !this.active ||
            this.renderer?.isOpen ||
            document.visibilityState !== 'visible'
          )
            return
          const p = instruction.payload
          const pillar =
            instruction.type === 'prompt.show'
              ? 'feedback'
              : instruction.type === 'survey.offer'
              ? 'survey'
              : instruction.type === 'inapp.show'
              ? 'inapp'
              : null
          if (!pillar) continue
          const id =
            p.campaignId ?? p.promptId ?? p.surveyId ?? p.message?.messageId
          if (typeof id !== 'string') continue
          const opened = await this.openExperience(pillar, id, instruction.id)
          if (generation !== this.generation) return
          if (opened.status === 'opened' || opened.status === 'failed') {
            this.inboxCursor = 0
            return
          }
        }
        const next = result.nextCursor
        if (next == null || next <= this.inboxCursor) {
          this.inboxCursor = 0
          return
        }
        this.inboxCursor = next
      }
    } finally {
      this.polling = false
    }
  }
  private getRenderer() {
    return (this.renderer ??= new WebRenderer({
      container: this.config?.container,
      nonce: this.config?.nonce,
      zIndex: this.config?.zIndex,
    }))
  }
  private check(purpose: 'feedback' | 'survey'): OpenResult | null {
    if (!this.active) return { status: 'inactive' }
    if (!this.consent[purpose]) return { status: 'consent_required' }
    if (this.renderer?.isOpen || this.opening) return { status: 'unavailable' }
    return null
  }
  openFeedback(promptId: string) {
    return this.openExperience('feedback', promptId)
  }
  openSurvey(surveyId: string) {
    return this.openExperience('survey', surveyId)
  }
  private async openExperience(
    pillar: 'feedback' | 'survey' | 'inapp',
    id: string,
    instructionId?: number,
    source?: 'link',
    prepared?: {
      status: string
      presentationId?: string
      content?: any
      attempt?: CreateSurveyAttemptResponse
    }
  ): Promise<OpenResult> {
    const purpose = pillar === 'survey' ? 'survey' : 'feedback'
    const blocked = this.check(purpose)
    if (blocked) return blocked
    this.opening = true
    const generation = this.generation
    const key = instructionId ? `instruction:${instructionId}` : uuid()
    try {
      const result =
        prepared ??
        (await this.api<{
          status: string
          presentationId?: string
          content?: any
          attempt?: CreateSurveyAttemptResponse
        }>('/v1/sdk/presentations/authorize', {
          clientId: this.clientId,
          pillar,
          campaignId: id,
          idempotencyKey: key,
          instructionId,
          screenName: this.screenName,
          prepareSurvey: pillar === 'survey' && instructionId !== undefined,
        }))
      if (result.status !== 'authorized')
        return {
          status:
            result.status === 'consent_required'
              ? 'consent_required'
              : 'unavailable',
        }
      if (
        generation !== this.generation ||
        !this.active ||
        !this.consent[purpose]
      )
        return { status: 'inactive' }
      const presentationId = result.presentationId!
      const shownKey = `presentations:shown`
      const shown = (await this.store?.get<string[]>(shownKey)) ?? []
      if (
        generation !== this.generation ||
        !this.active ||
        !this.consent[purpose]
      )
        return { status: 'inactive' }
      if (shown.includes(presentationId)) return { status: 'unavailable' }
      let content = result.content
      const started = Date.now()
      const receipt = (event: string) =>
        this.enqueue(
          `/v1/sdk/presentations/${presentationId}/receipt`,
          { clientId: this.clientId, event },
          purpose
        ).catch((error) =>
          this.diagnostic(
            'receipt_pending',
            error instanceof Error ? error.message : 'Receipt not saved'
          )
        )
      if (pillar === 'survey') {
        const attempt =
          result.attempt ??
          (await this.api<CreateSurveyAttemptResponse>(
            `/v1/sdk/surveys/${id}/attempts`,
            {
              ...this.identity(),
              source: source ?? (instructionId ? 'triggered' : 'on_demand'),
              presentationId,
              resume: true,
              platform: 'web',
              sdkVersion: VERSION,
            }
          ))
        if (generation !== this.generation) return { status: 'inactive' }
        if (attempt.resolvedContent) content = attempt.resolvedContent
        const local = await this.store?.get<{
          answers: SurveyAnswerRecord
          currentQuestionId: string | null
          at: number
        }>(`survey:${attempt.attemptId}`)
        if (
          generation !== this.generation ||
          !this.active ||
          !this.consent.survey
        )
          return { status: 'inactive' }
        this.getRenderer().show({
          ...content,
          pillar,
          answers: local?.answers ?? attempt.progressSnapshot,
          currentQuestionId:
            local?.currentQuestionId ??
            attempt.currentQuestionId ??
            attempt.startQuestionId,
          onCta: (cta: NonNullable<RenderExperience['ctas']>[number]) =>
            this.handleCta(cta),
          onProgress: async (
            answers: SurveyAnswerRecord,
            currentQuestionId: string | null
          ) => {
            await this.store?.set(`survey:${attempt.attemptId}`, {
              answers,
              currentQuestionId,
              at: Date.now(),
            })
            await this.enqueue(
              `/v1/sdk/surveys/attempts/${attempt.attemptId}`,
              { progressSnapshot: answers, currentQuestionId },
              'survey',
              'PATCH'
            )
          },
          onSubmit: async (answers: SurveyAnswerRecord) => {
            await this.enqueue(
              `/v1/sdk/surveys/attempts/${attempt.attemptId}/complete`,
              {
                finalAnswers: Object.entries(answers).map(
                  ([questionId, value]) => ({ questionId, value })
                ),
                latencyMs: Math.min(3600000, Math.max(0, Date.now() - started)),
              },
              'survey'
            )
            await receipt('completed')
            this.emit('surveyComplete', {
              surveyId: id,
              attemptId: attempt.attemptId,
            })
          },
          onDismiss: () => {
            void receipt('dismissed')
            this.emit('surveyAbandon', {
              surveyId: id,
              attemptId: attempt.attemptId,
            })
          },
        })
      } else if (pillar === 'feedback') {
        this.getRenderer().show({
          ...content,
          pillar,
          onSubmit: async (answers: SurveyAnswerRecord) => {
            await this.enqueue(
              '/v1/sdk/responses',
              {
                idempotencyKey: presentationId,
                promptId: id,
                ...this.identity(),
                answers: Object.entries(answers).map(([questionId, value]) => ({
                  questionId,
                  value,
                })),
                latencyMs: Math.min(3600000, Math.max(0, Date.now() - started)),
                platform: 'web',
              },
              'feedback'
            )
            await receipt('completed')
            this.emit('response', { promptId: id, answers })
          },
          onDismiss: () => {
            void receipt('dismissed')
          },
        })
      } else {
        this.getRenderer().show({
          ...content,
          pillar,
          onDismiss: () => {
            void receipt('dismissed')
            this.track('$inapp_dismissed', { message_id: id })
          },
          onCta: (cta: NonNullable<RenderExperience['ctas']>[number]) => {
            void receipt('cta_clicked')
            this.track('$inapp_cta_clicked', { message_id: id })
            this.handleCta(cta)
            this.renderer?.close(false)
          },
        })
      }
      if (pillar === 'inapp') this.track('$inapp_shown', { message_id: id })
      await this.store?.set(
        shownKey,
        [...shown, presentationId].slice(-200)
      )
      if (generation !== this.generation || !this.active)
        return { status: 'inactive' }
      await receipt('shown')
      this.emit(`${pillar}Show`, { id, presentationId })
      this.schedule(0)
      return { status: 'opened' }
    } catch (error) {
      this.diagnostic(
        'open_failed',
        error instanceof Error ? error.message : 'Unable to open experience'
      )
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : undefined,
      }
    } finally {
      this.opening = false
    }
  }
  private handleCta(cta: NonNullable<RenderExperience['ctas']>[number]) {
    if (cta.action === 'open_url' && cta.target) {
      const url = safeUrl(cta.target)
      if (url) {
        if (this.config?.onNavigate) this.config.onNavigate(url)
        else window.location.assign(url)
      }
    }
    if (cta.action === 'deep_link' && cta.target)
      this.config?.onDeepLink?.(cta.target)
    if (cta.action === 'custom_event' && cta.target) this.track(cta.target)
    if (cta.action === 'json' && cta.actionJson)
      this.config?.onAction?.(cta.actionJson)
    this.emit('inappCta', cta)
  }
  private query(extra: Record<string, string> = {}) {
    return new URLSearchParams({
      anonymousId: this.anonymousId ?? '',
      ...(this.externalId ? { externalId: this.externalId } : {}),
      ...extra,
    }).toString()
  }
  private requirePurpose(purpose: 'feedback' | 'survey') {
    if (!this.active) throw new WebSdkError('Activate a user first')
    if (!this.consent[purpose])
      throw new WebSdkError(`Grant ${purpose} consent first`)
  }
  async getAvailableSurveys(): Promise<SurveySummary[]> {
    this.requirePurpose('survey')
    return (
      await this.api<{ surveys: SurveySummary[] }>(
        `/v1/sdk/surveys/available?${this.query()}`
      )
    ).surveys
  }
  async handleSurveyLink(url: string): Promise<boolean> {
    this.requirePurpose('survey')
    const parsed = new URL(url, document.baseURI)
    const token =
      parsed.searchParams.get('token') ??
      parsed.pathname.split('/').filter(Boolean).at(-1)
    if (!token) return false
    const result = await this.api<{ surveyId: string }>(
      '/v1/sdk/surveys/resolve-link',
      { ...this.identity(), token }
    )
    return (
      (await this.openExperience('survey', result.surveyId, undefined, 'link'))
        .status === 'opened'
    )
  }
  async getRequestBranding() {
    this.requirePurpose('feedback')
    return this.api<{
      entryLabel: string
      accentColor: string | null
      logoUrl: string | null
      introCopy: string | null
    }>('/v1/sdk/request-branding')
  }
  async getRequests(
    options: Record<string, string> = {}
  ): Promise<GetRequestsResult> {
    this.requirePurpose('feedback')
    return this.api(`/v1/sdk/requests?${this.query(options)}`)
  }
  async getRequest(id: string): Promise<RequestDto> {
    this.requirePurpose('feedback')
    return this.api(
      `/v1/sdk/requests/${encodeURIComponent(id)}?${this.query()}`
    )
  }
  private async requestMutation<T>(
    path: string,
    body: unknown,
    method = 'POST'
  ): Promise<RequestMutationResult<T>> {
    this.requirePurpose('feedback')
    const generation = this.generation
    const item: PersistedWork = {
      id: uuid(),
      path,
      body,
      method,
      purpose: 'feedback',
      createdAt: Date.now(),
    }
    const outcome: {
      delivered?: boolean
      result?: unknown
      error?: unknown
    } = {}
    const prepare = this.writes.then(async () => {
      if (
        generation !== this.generation ||
        !this.active ||
        !this.consent.feedback
      )
        throw new WebSdkError('Participation changed')
      if (this.queue.length >= (this.config?.maxQueueSize ?? 500))
        throw new WebSdkError('The pending queue is full. Reconnect and retry.')
      this.mutationResults.set(item.id, outcome)
      this.queue.push(item)
      await this.persist()
    })
    this.writes = prepare.catch(() => {})
    try {
      await prepare
      // flush() is the only sender, so retries and new mutations share ordering.
      try {
        await this.flush()
      } catch (error) {
        if (
          error instanceof WebSdkError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 401 &&
          error.status !== 429
        )
          throw error
      }
      if (
        generation !== this.generation ||
        !this.active ||
        !this.consent.feedback
      )
        throw new WebSdkError('Participation changed')
      if (outcome.error) throw outcome.error
      if (outcome.delivered) return outcome.result as T
      this.schedule(0)
      this.emit('requestQueued', { pendingId: item.id })
      return { queued: true, pendingId: item.id }
    } finally {
      this.mutationResults.delete(item.id)
    }
  }
  async submitRequest(
    title: string,
    description: string
  ): Promise<RequestMutationResult<RequestDto>> {
    this.requirePurpose('feedback')
    return this.requestMutation<RequestDto>('/v1/sdk/requests', {
      ...this.identity(),
      idempotencyKey: uuid(),
      title: validText(title, 120, 'Title'),
      description: validText(description, 1500, 'Description'),
    })
  }
  async voteOnRequest(
    id: string,
    vote: boolean
  ): Promise<RequestMutationResult<RequestVote>> {
    this.requirePurpose('feedback')
    return this.requestMutation<RequestVote>(
      `/v1/sdk/requests/${encodeURIComponent(id)}/vote`,
      { ...this.identity(), vote }
    )
  }
  async followRequest(
    id: string,
    follow: boolean
  ): Promise<RequestMutationResult<RequestFollow>> {
    this.requirePurpose('feedback')
    return this.requestMutation<RequestFollow>(
      `/v1/sdk/requests/${encodeURIComponent(id)}/follow`,
      { ...this.identity(), follow }
    )
  }
  async getComments(id: string): Promise<ReadonlyArray<RequestComment>> {
    this.requirePurpose('feedback')
    return (
      await this.api<{ items: RequestComment[] }>(
        `/v1/sdk/requests/${encodeURIComponent(id)}/comments?${this.query()}`
      )
    ).items
  }
  async postComment(
    id: string,
    body: string
  ): Promise<RequestMutationResult<RequestComment>> {
    this.requirePurpose('feedback')
    return this.requestMutation<RequestComment>(
      `/v1/sdk/requests/${encodeURIComponent(id)}/comments`,
      {
        ...this.identity(),
        body: validText(body, 1000, 'Comment'),
        idempotencyKey: uuid(),
      }
    )
  }
  async editComment(
    id: string,
    commentId: string,
    body: string
  ): Promise<RequestMutationResult<RequestComment>> {
    this.requirePurpose('feedback')
    return this.requestMutation<RequestComment>(
      `/v1/sdk/requests/${encodeURIComponent(id)}/comments/${encodeURIComponent(
        commentId,
      )}`,
      {
        anonymousId: this.anonymousId,
        body: validText(body, 1000, 'Comment'),
      },
      'PATCH'
    )
  }
  async deleteComment(
    id: string,
    commentId: string
  ): Promise<RequestMutationResult<void>> {
    this.requirePurpose('feedback')
    return this.requestMutation<void>(
      `/v1/sdk/requests/${encodeURIComponent(id)}/comments/${encodeURIComponent(
        commentId,
      )}?${this.query()}`,
      undefined,
      'DELETE'
    )
  }
  openRequestsBoard(): Promise<OpenResult> {
    return this.openRequests()
  }
  openRequestDetail(id: string): Promise<OpenResult> {
    return this.openRequests(id)
  }
  private async openRequests(id?: string): Promise<OpenResult> {
    const blocked = this.check('feedback')
    if (blocked) return blocked
    const generation = this.generation
    this.opening = true
    try {
      const { showRequestBoard, showRequestDetail } = await import(
        './requests-ui.js'
      )
      if (
        generation !== this.generation ||
        !this.active ||
        !this.consent.feedback
      )
        return { status: 'inactive' }
      if (id) await showRequestDetail(this, this.getRenderer(), id)
      else await showRequestBoard(this, this.getRenderer())
      return generation === this.generation
        ? { status: 'opened' }
        : { status: 'inactive' }
    } catch (error) {
      this.diagnostic(
        'requests_failed',
        error instanceof Error ? error.message : 'Unable to open requests'
      )
      return { status: 'failed' }
    } finally {
      this.opening = false
    }
  }
  private mountLauncher() {
    if (!this.active || !this.config?.launcher?.enabled) return
    const renderer = this.getRenderer()
    renderer.shadow.querySelector('.ug-launcher')?.remove()
    renderer.shadow.querySelector('.ug-launch-menu')?.remove()
    const config = this.config.launcher
    const actions: Array<[string, () => void]> = []
    if (config.feedbackPromptId && this.consent.feedback)
      actions.push([
        'Give feedback',
        () => {
          void this.openFeedback(config.feedbackPromptId!)
        },
      ])
    if (config.surveys && this.consent.survey)
      actions.push([
        'Available surveys',
        () => {
          void this.showSurveyInbox()
        },
      ])
    if (config.requests && this.consent.feedback)
      actions.push([
        'Feature requests',
        () => {
          void this.openRequestsBoard()
        },
      ])
    if (!actions.length) return
    const launcher = el(
      'button',
      `ug-launcher ${config.position === 'left' ? 'left' : ''}`,
      config.label ?? 'Feedback'
    )
    launcher.setAttribute('aria-expanded', 'false')
    launcher.onclick = () => {
      const existing = renderer.shadow.querySelector('.ug-launch-menu')
      if (existing) {
        existing.remove()
        launcher.setAttribute('aria-expanded', 'false')
        return
      }
      const menu = el('div', 'ug-launch-menu')
      for (const [label, action] of actions) {
        const button = el('button', '', label)
        button.onclick = () => {
          menu.remove()
          launcher.setAttribute('aria-expanded', 'false')
          action()
        }
        menu.append(button)
      }
      renderer.shadow.append(menu)
      launcher.setAttribute('aria-expanded', 'true')
    }
    renderer.shadow.append(launcher)
  }
  private async showSurveyInbox() {
    try {
      const surveys = await this.getAvailableSurveys()
      const renderer = this.getRenderer()
      const surface = renderer.frame('survey', 'Available surveys')
      const content = el('div', 'ug-content')
      renderer.header(
        content,
        'Available surveys',
        surveys.length
          ? 'Choose a survey to share your thoughts.'
          : 'You’re all caught up.'
      )
      for (const survey of surveys) {
        const button = el('button', 'ug-list-item', survey.name)
        button.onclick = () => {
          renderer.close(false)
          void this.openSurvey(survey.id)
        }
        content.append(button)
      }
      surface.append(content)
    } catch (error) {
      this.diagnostic(
        'inbox_failed',
        error instanceof Error ? error.message : 'Unable to load surveys'
      )
    }
  }
  reset(broadcast = true): Promise<void> {
    return (this.resetWork ??= this.performReset(broadcast).finally(() => {
      this.resetWork = undefined
    }))
  }
  private async performReset(broadcast = true): Promise<void> {
    const clientId = this.clientId
    this.generation++
    this.inboxCursor = 0
    if (this.timer) clearTimeout(this.timer)
    for (const request of this.requests) request.abort()
    const end =
      clientId && this.token
        ? this.api(`/v1/sdk/clients/${clientId}/end`, {}, 'POST', false).catch(
            () => {},
          )
        : Promise.resolve()
    this.state = 'inactive'
    this.changed()
    if (broadcast) this.channel?.postMessage('reset')
    this.channel?.close()
    this.channel = undefined
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.visibility)
    if (typeof window !== 'undefined')
      window.removeEventListener('online', this.online)
    this.renderer?.destroy()
    this.renderer = undefined
    this.queue = []
    await this.writes
    await this.store?.set('queue', [])
    await this.store?.set('alias', undefined)
    if (this.credentialKey)
      try {
        sessionStorage.removeItem(this.credentialKey)
      } catch {}
    if (this.instanceKey)
      try {
        sessionStorage.removeItem(this.instanceKey)
      } catch {}
    this.instanceKey = undefined
    this.credentialKey = undefined
    this.state = 'inactive'
    this.token = null
    this.externalId = null
    this.anonymousId = null
    this.clientId = null
    this.consent = {}
    this.store = undefined
    this.changed()
    await end
  }
  async destroy() {
    await this.reset()
    this.state = 'destroyed'
    this.changed()
    this.listeners.clear()
    this.events.clear()
  }
  getAnonymousId() {
    return this.anonymousId
  }
  getExternalId() {
    return this.externalId
  }
  setDebug(debug: boolean) {
    if (this.config) this.config = { ...this.config, debug }
  }
  setThemeOverrides(theme: NonNullable<RenderExperience['theme']>) {
    this.getRenderer().setTheme(theme)
  }
}
export const UserGist = new UserGistClient()
export function createUserGist() {
  return new UserGistClient()
}
