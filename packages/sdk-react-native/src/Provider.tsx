// <RitmusProvider> — mounts host views that listen for internal showPrompt /
// showSurvey events and render the appropriate modal.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Ritmus } from './Ritmus.js'
import { PromptSheet } from './ui/PromptSheet.js'
import { SurveyView } from './ui/SurveyView.js'
import type { ShowPromptPayload, ResponseEmission } from './internal/types.js'
import type {
  SurveyAnswerRecord,
  SurveyAttemptSource,
  SurveyCampaignWithFlow,
} from '@ritmus/sdk-core'

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

export function RitmusProvider({ children }: Props): React.ReactElement {
  const [payload, setPayload] = useState<ShowPromptPayload | null>(null)
  const currentRef = useRef<ShowPromptPayload | null>(null)

  const [surveyState, setSurveyState] = useState<SurveyState | null>(null)

  useEffect(() => {
    let unsubShow: (() => void) | null = null
    let unsubDismiss: (() => void) | null = null
    let unsubShowSurvey: (() => void) | null = null
    let unsubInvite: (() => void) | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    function attach(): void {
      try {
        const bus = Ritmus.__internal_events()
        unsubShow = bus.on('showPrompt', (p) => {
          currentRef.current = p
          setPayload(p)
        })
        unsubDismiss = bus.on('dismissPrompt', () => {
          currentRef.current = null
          setPayload(null)
        })
        unsubShowSurvey = bus.on('showSurvey', (payload) => {
          void openSurvey(payload.surveyId, payload.source as SurveyAttemptSource)
        })
        unsubInvite = bus.on('surveyInvite', (invite) => {
          // If host registered onInvite, defer rendering to them. Otherwise
          // auto-open — convenient for dev, sensible default for simple apps.
          const handlers = (() => {
            try {
              return Ritmus.__internal_surveyHandlers()
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
          void openSurvey(invite.surveyId, invite.source as SurveyAttemptSource)
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
    }
  }, [])

  const openSurvey = useCallback(
    async (surveyId: string, source: SurveyAttemptSource): Promise<void> => {
      try {
        // Local-fire fast-path: when the survey-matcher just fired,
        // the full survey content is already in the SDK's cache. Use
        // it instead of round-tripping to the server. Falls back to
        // a fetch for offer-ledger / on-demand opens that arrive
        // through the polling path.
        const cached = Ritmus.__internal_armedSurveyById(surveyId)
        const survey = cached ?? (await Ritmus.__internal_fetchSurvey(surveyId))
        if (!survey) return
        const attempt = await Ritmus.__internal_createAttempt(surveyId, source)
        if (!attempt) return
        setSurveyState({
          survey,
          attemptId: attempt.attemptId,
          source,
          initialQuestionId: attempt.currentQuestionId ?? attempt.startQuestionId,
          initialSnapshot: attempt.snapshot ?? {},
        })
      } catch {
        // ignore
      }
    },
    [],
  )

  function handleSubmit(r: ResponseEmission): void {
    const p = currentRef.current
    currentRef.current = null
    setPayload(null)
    if (p) {
      void Ritmus.__internal_submitResponse(r, p.triggerEventName)
    }
  }

  function handleDismiss(r: ResponseEmission): void {
    const p = currentRef.current
    currentRef.current = null
    setPayload(null)
    if (p) {
      void Ritmus.__internal_submitResponse(r, p.triggerEventName)
    }
  }

  const themeOverride = (() => {
    try {
      return Ritmus.__internal_theme()
    } catch {
      return null
    }
  })()

  const surveyHandlers = (() => {
    try {
      return Ritmus.__internal_surveyHandlers()
    } catch {
      return {}
    }
  })()

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
          Ritmus.__internal_saveProgress(attemptId, qid, snap)
        }
        onSubmitAnswers={(attemptId, answers) =>
          Ritmus.__internal_submitAnswers(attemptId, answers)
        }
        onCompleteAttempt={(attemptId) => Ritmus.__internal_completeAttempt(attemptId)}
        onAbandonAttempt={(attemptId) => Ritmus.__internal_abandonAttempt(attemptId)}
        onDismissRequest={() => setSurveyState(null)}
        onShow={(sid) => surveyHandlers.onShow?.(sid)}
        onComplete={(sid, aid) => {
          surveyHandlers.onComplete?.(sid, aid)
        }}
        onAbandon={(sid, aid) => {
          surveyHandlers.onAbandon?.(sid, aid)
          setSurveyState(null)
        }}
      />
    </>
  )
}
