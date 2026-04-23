// <RitmusProvider> — mounts a host view that listens for internal showPrompt
// events from the trigger matcher and renders a <PromptSheet> modal.
//
// Submitting calls the singleton's internal submit helper which:
//   - posts to /v1/sdk/responses (consent-gated)
//   - tracks a $feedback_response event through the normal pipeline

import React, { useEffect, useRef, useState } from 'react'
import { Ritmus } from './Ritmus.js'
import { PromptSheet } from './ui/PromptSheet.js'
import type { ShowPromptPayload, ResponseEmission } from './internal/types.js'

interface Props {
  readonly children?: React.ReactNode
}

export function RitmusProvider({ children }: Props): React.ReactElement {
  const [payload, setPayload] = useState<ShowPromptPayload | null>(null)
  const currentRef = useRef<ShowPromptPayload | null>(null)

  useEffect(() => {
    let unsubShow: (() => void) | null = null
    let unsubDismiss: (() => void) | null = null
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
      } catch {
        // init not called yet — retry shortly.
        retryTimer = setTimeout(attach, 250)
      }
    }
    attach()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (unsubShow) unsubShow()
      if (unsubDismiss) unsubDismiss()
    }
  }, [])

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

  return (
    <>
      {children}
      <PromptSheet
        payload={payload}
        themeOverride={themeOverride ?? undefined}
        onSubmit={handleSubmit}
        onDismiss={handleDismiss}
      />
    </>
  )
}
