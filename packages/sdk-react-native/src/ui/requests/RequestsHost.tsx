/**
 * Single root-level Modal that hosts the feature-requests pillar UI.
 * Listens for `showRequestsBoard` / `showRequestDetail` events and
 * switches between Board / Detail / Submit views via an internal
 * state machine — NO nested modals.
 *
 * Mounted automatically by <RitmusProvider>; host apps never render
 * this themselves. They open it with `Ritmus.openRequestsBoard()`.
 */
import React, { useEffect, useState } from 'react'
import { Modal, SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { Ritmus } from '../../Ritmus.js'
import { BoardView } from './BoardView.js'
import { DetailView } from './DetailView.js'
import { SubmitView } from './SubmitView.js'
import { useBranding } from './shared.js'

type ViewState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'board' }
  | { readonly kind: 'detail'; readonly requestId: string }
  | { readonly kind: 'submit' }

export function RequestsHost(): React.ReactElement | null {
  const [view, setView] = useState<ViewState>({ kind: 'closed' })
  const branding = useBranding()

  useEffect(() => {
    let unsubBoard: (() => void) | null = null
    let unsubDetail: (() => void) | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function attach(): void {
      try {
        const bus = Ritmus.__internal_events()
        unsubBoard = bus.on('showRequestsBoard', () => {
          setView({ kind: 'board' })
        })
        unsubDetail = bus.on('showRequestDetail', ({ requestId }) => {
          setView({ kind: 'detail', requestId })
        })
      } catch {
        retryTimer = setTimeout(attach, 250)
      }
    }
    attach()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (unsubBoard) unsubBoard()
      if (unsubDetail) unsubDetail()
    }
  }, [])

  const visible = view.kind !== 'closed'
  const close = () => setView({ kind: 'closed' })

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
      statusBarTranslucent={false}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe}>
        {view.kind === 'board' ? (
          <BoardView
            branding={branding}
            onClose={close}
            onOpenDetail={(requestId) => setView({ kind: 'detail', requestId })}
            onOpenSubmit={() => setView({ kind: 'submit' })}
          />
        ) : view.kind === 'detail' ? (
          <DetailView
            branding={branding}
            requestId={view.requestId}
            onBack={() => setView({ kind: 'board' })}
          />
        ) : view.kind === 'submit' ? (
          <SubmitView
            branding={branding}
            onCancel={() => setView({ kind: 'board' })}
            onPosted={(requestId) => setView({ kind: 'detail', requestId })}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa' },
})
