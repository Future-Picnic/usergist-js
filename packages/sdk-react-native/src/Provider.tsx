// <UserGistProvider> — mounts host views that listen for internal showPrompt /
// showSurvey events and render the appropriate modal.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Linking } from 'react-native'
import { UserGist } from './UserGist.js'
import { PromptSheet } from './ui/PromptSheet.js'
import { SurveyView } from './ui/SurveyView.js'
import { InAppMessageView } from './ui/InAppMessageView.js'
import { RequestsHost } from './ui/requests/RequestsHost.js'
import { createModalQueue, type ModalTask } from './internal/modal-queue.js'
import type { ShowPromptPayload, ResponseEmission } from './internal/types.js'
import type {
  ArmedInAppMessage,
  EventPropertyValue,
  InAppCta,
  InAppCtaAction,
  JsonAction,
  SurveyAnswerRecord,
  SurveyAttemptSource,
  SurveyCampaignWithFlow,
} from '@usergist/sdk-core/mobile'
import {
  INAPP_AUTO_DISMISSED_EVENT_NAME,
  INAPP_CTA_CLICKED_EVENT_NAME,
  INAPP_DISMISSED_EVENT_NAME,
  INAPP_SHOWN_EVENT_NAME,
} from '@usergist/sdk-core/mobile'

function safeInAppHandlers(): {
  onShow?: (messageId: string) => void
  onDismiss?: (messageId: string, reason: 'user' | 'auto') => void
  onCtaClick?: (args: {
    messageId: string
    action: InAppCtaAction
    target?: string
    actionJson?: JsonAction
    label: string
    index: number
  }) => void
  onJsonAction?: (action: JsonAction, context: {
    source: 'in_app'
    messageId: string
    label: string
    index: number
  }) => void
} {
  try {
    return UserGist.__internal_inAppHandlers()
  } catch {
    return {}
  }
}

function safeSurveyHandlers(): {
  onShow?: (surveyId: string) => void
  onComplete?: (surveyId: string, attemptId: string) => void
  onAbandon?: (surveyId: string, attemptId: string) => void
} {
  try {
    return UserGist.__internal_surveyHandlers()
  } catch {
    return {}
  }
}

function safeTrack(
  event: string,
  props?: Record<string, EventPropertyValue>,
): void {
  try {
    UserGist.track(event, props)
  } catch {
    // best-effort — never throw out of a UI side-effect
  }
}

interface Props {
  readonly children?: React.ReactNode
}

interface SurveyState {
  readonly survey: SurveyCampaignWithFlow
  readonly attemptId: string
  readonly source: SurveyAttemptSource
  readonly initialQuestionId: string | null
  readonly initialSnapshot: SurveyAnswerRecord
}

export function UserGistProvider({ children }: Props): React.ReactElement {
  const [payload, setPayload] = useState<ShowPromptPayload | null>(null)
  const currentRef = useRef<ShowPromptPayload | null>(null)

  const [surveyState, setSurveyState] = useState<SurveyState | null>(null)
  const [inAppMessage, setInAppMessage] = useState<ArmedInAppMessage | null>(null)
  const modalQueueRef = useRef(createModalQueue())
  const promptReleaseRef = useRef<(() => void) | null>(null)
  const surveyReleaseRef = useRef<(() => void) | null>(null)
  const inAppReleaseRef = useRef<(() => void) | null>(null)

  function enqueueModal(task: ModalTask): void {
    modalQueueRef.current.enqueue(task)
  }

  function releasePrompt(): void {
    const release = promptReleaseRef.current
    promptReleaseRef.current = null
    release?.()
  }

  function releaseSurvey(): void {
    const release = surveyReleaseRef.current
    surveyReleaseRef.current = null
    release?.()
  }

  function releaseInApp(): void {
    const release = inAppReleaseRef.current
    inAppReleaseRef.current = null
    release?.()
  }

  useEffect(() => {
    let unsubShow: (() => void) | null = null
    let unsubDismiss: (() => void) | null = null
    let unsubShowSurvey: (() => void) | null = null
    let unsubInvite: (() => void) | null = null
    let unsubShowInApp: (() => void) | null = null
    let unsubResetSurfaces: (() => void) | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    function attach(): void {
      try {
        const bus = UserGist.__internal_events()
        unsubShow = bus.on('showPrompt', (p) => {
          enqueueModal((release) => {
            promptReleaseRef.current = release
            currentRef.current = p
            setPayload(p)
            safeTrack('$feedback_prompt_shown', { prompt_id: p.prompt.id })
            bus.emit('promptShown', p)
          })
        })
        unsubDismiss = bus.on('dismissPrompt', () => {
          currentRef.current = null
          setPayload(null)
          releasePrompt()
        })
        unsubShowSurvey = bus.on('showSurvey', (payload) => {
          enqueueModal((release) => {
            surveyReleaseRef.current = release
            void openSurvey(
              payload.surveyId,
              payload.source as SurveyAttemptSource,
              payload.language,
            ).then((shown) => {
              if (!shown) releaseSurvey()
            })
          })
        })
        unsubShowInApp = bus.on('showInAppMessage', (p) => {
          enqueueModal((release) => {
            inAppReleaseRef.current = release
            setInAppMessage(p.message)
            // Track impression so analytics + cross-pillar caps see it —
            // the analytics endpoint pivots on properties.message_id.
            safeTrack(INAPP_SHOWN_EVENT_NAME, { message_id: p.messageId })
            safeInAppHandlers().onShow?.(p.messageId)
          })
        })
        unsubResetSurfaces = bus.on('resetSurfaces', () => {
          modalQueueRef.current.clearPending()
          currentRef.current = null
          setPayload(null)
          setSurveyState(null)
          setInAppMessage(null)
          releasePrompt()
          releaseSurvey()
          releaseInApp()
        })
        unsubInvite = bus.on('surveyInvite', (invite) => {
          // If host registered onInvite, defer rendering to them. Otherwise
          // auto-open — convenient for dev, sensible default for simple apps.
          const handlers = (() => {
            try {
              return UserGist.__internal_surveyHandlers()
            } catch {
              return {}
            }
          })()
          if (handlers.onInvite) {
            handlers.onInvite({
              surveyId: invite.surveyId,
              name: invite.name,
              source: invite.source,
            })
            return
          }
          enqueueModal((release) => {
            surveyReleaseRef.current = release
            void openSurvey(
              invite.surveyId,
              invite.source as SurveyAttemptSource,
            ).then((shown) => {
              if (!shown) releaseSurvey()
            })
          })
        })
      } catch {
        retryTimer = setTimeout(attach, 250)
      }
    }
    attach()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (unsubShow) unsubShow()
      if (unsubDismiss) unsubDismiss()
      if (unsubShowSurvey) unsubShowSurvey()
      if (unsubInvite) unsubInvite()
      if (unsubShowInApp) unsubShowInApp()
      if (unsubResetSurfaces) unsubResetSurfaces()
      modalQueueRef.current.clearPending()
    }
  }, [])

  const openSurvey = useCallback(
    async (
      surveyId: string,
      source: SurveyAttemptSource,
      language?: string,
    ): Promise<boolean> => {
      try {
        // Local-fire fast-path: when the survey-matcher just fired,
        // the full survey content is already in the SDK's cache. Use
        // it instead of round-tripping to the server. Falls back to
        // a fetch for offer-ledger / on-demand opens that arrive
        // through the polling path.
        const cached = language ? null : UserGist.__internal_armedSurveyById(surveyId)
        const survey = cached ?? (await UserGist.__internal_fetchSurvey(surveyId, language))
        if (!survey) return false
        const attempt = await UserGist.__internal_createAttempt(surveyId, source, language)
        if (!attempt) return false
        setSurveyState({
          survey,
          attemptId: attempt.attemptId,
          source,
          initialQuestionId: attempt.currentQuestionId ?? attempt.startQuestionId,
          initialSnapshot: attempt.snapshot ?? {},
        })
        return true
      } catch {
        return false
      }
    },
    [],
  )

  async function handleSubmit(r: ResponseEmission): Promise<void> {
    const p = currentRef.current
    if (p) {
      await UserGist.__internal_submitResponse(r, p.triggerEventName)
      currentRef.current = null
      setPayload(null)
      releasePrompt()
    }
  }

  async function handleDismiss(r: ResponseEmission): Promise<void> {
    const p = currentRef.current
    if (p) {
      await UserGist.__internal_submitResponse(r, p.triggerEventName)
      currentRef.current = null
      setPayload(null)
      releasePrompt()
    }
  }

  function handleInAppDismiss(reason: 'user' | 'auto'): void {
    const m = inAppMessage
    setInAppMessage(null)
    releaseInApp()
    if (!m) return
    safeTrack(
      reason === 'auto'
        ? INAPP_AUTO_DISMISSED_EVENT_NAME
        : INAPP_DISMISSED_EVENT_NAME,
      { message_id: m.messageId, dismiss_reason: reason },
    )
    safeInAppHandlers().onDismiss?.(m.messageId, reason)
  }

  function handleInAppCta(cta: InAppCta, index: number): void {
    const m = inAppMessage
    if (!m) return
    safeTrack(INAPP_CTA_CLICKED_EVENT_NAME, {
      message_id: m.messageId,
      cta_index: index,
      cta_action: cta.action,
      cta_label: cta.label,
    })
    try {
      safeInAppHandlers().onCtaClick?.({
        messageId: m.messageId,
        action: cta.action,
        target: cta.target,
        actionJson: cta.actionJson,
        label: cta.label,
        index,
      })
    } catch {
      // Host callbacks cannot interrupt SDK action dispatch or cleanup.
    }
    if (cta.action === 'custom_event' && cta.target) {
      safeTrack(cta.target, {
        message_id: m.messageId,
        cta_index: index,
        cta_label: cta.label,
      })
    } else if ((cta.action === 'open_url' || cta.action === 'deep_link') && cta.target) {
      void Linking.openURL(cta.target).catch(() => undefined)
    } else if (cta.action === 'json' && cta.actionJson) {
      try {
        safeInAppHandlers().onJsonAction?.(cta.actionJson, {
          source: 'in_app',
          messageId: m.messageId,
          label: cta.label,
          index,
        })
      } catch {
        // Host action executors are isolated from the SDK UI lifecycle.
      }
    }
    // CTA tap implicitly closes the message.
    setInAppMessage(null)
    releaseInApp()
  }

  const themeOverride = (() => {
    try {
      return UserGist.__internal_theme()
    } catch {
      return null
    }
  })()

  const handleSurveyShow = useCallback((surveyId: string): void => {
    UserGist.__internal_reportSurveyShown(surveyId)
    safeSurveyHandlers().onShow?.(surveyId)
  }, [])
  const handleSurveyComplete = useCallback((surveyId: string, attemptId: string): void => {
    safeSurveyHandlers().onComplete?.(surveyId, attemptId)
  }, [])
  const handleSurveyAbandon = useCallback((surveyId: string, attemptId: string): void => {
    safeSurveyHandlers().onAbandon?.(surveyId, attemptId)
    setSurveyState(null)
    releaseSurvey()
  }, [])

  return (
    <>
      {children}
      <PromptSheet
        payload={payload}
        themeOverride={themeOverride ?? undefined}
        onSubmit={handleSubmit}
        onDismiss={handleDismiss}
      />
      <SurveyView
        survey={surveyState?.survey ?? null}
        attemptId={surveyState?.attemptId ?? null}
        initialSnapshot={surveyState?.initialSnapshot ?? {}}
        initialQuestionId={surveyState?.initialQuestionId ?? null}
        source={surveyState?.source ?? 'on_demand'}
        themeOverride={themeOverride}
        onSaveProgress={(attemptId, qid, snap) =>
          UserGist.__internal_saveProgress(attemptId, qid, snap)
        }
        onCompleteAttempt={(attemptId, answers) =>
          UserGist.__internal_completeAttempt(attemptId, answers)
        }
        onAbandonAttempt={(attemptId) => UserGist.__internal_abandonAttempt(attemptId)}
        onDismissRequest={() => {
          setSurveyState(null)
          releaseSurvey()
        }}
        onShow={handleSurveyShow}
        onComplete={handleSurveyComplete}
        onAbandon={handleSurveyAbandon}
      />
      <InAppMessageView
        message={inAppMessage}
        themeOverride={themeOverride}
        onCtaPress={handleInAppCta}
        onDismiss={handleInAppDismiss}
      />
      <RequestsHost />
    </>
  )
}
