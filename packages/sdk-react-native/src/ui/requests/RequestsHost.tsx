/**
 * Single root-level Modal that hosts the feature-requests pillar UI.
 * Listens for `showRequestsBoard` / `showRequestDetail` events and
 * switches between Board / Detail / Submit views via an internal
 * state machine — NO nested modals.
 *
 * Mounted automatically by <UserGistProvider>; host apps never render
 * this themselves. They open it with `UserGist.openRequestsBoard()`.
 */
import React, { useEffect, useState } from 'react'
import { Modal, StatusBar, StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { UserGist } from '../../UserGist.js'
import { BoardView } from './BoardView.js'
import { DetailView } from './DetailView.js'
import { SubmitView } from './SubmitView.js'
import { useBranding, useRequestsTheme } from './shared.js'
import { readableOn } from '../color.js'
import { useModalSlot } from '../../internal/modal-coordinator.js'

type ViewState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'board' }
  | { readonly kind: 'detail'; readonly requestId: string }
  | { readonly kind: 'submit' }

export function RequestsHost(): React.ReactElement | null {
  const [view, setView] = useState<ViewState>({ kind: 'closed' })
  const branding = useBranding()
  const theme = useRequestsTheme(branding)

  useEffect(() => {
    let unsubBoard: (() => void) | null = null
    let unsubDetail: (() => void) | null = null
    let unsubReset: (() => void) | null = null
    let unsubDismiss: (() => void) | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function attach(): void {
      try {
        const bus = UserGist.__internal_events()
        unsubBoard = bus.on('showRequestsBoard', () => {
          setView({ kind: 'board' })
        })
        unsubDetail = bus.on('showRequestDetail', ({ requestId }) => {
          setView({ kind: 'detail', requestId })
        })
        unsubReset = bus.on('resetSurfaces', () => setView({ kind: 'closed' }))
        unsubDismiss = bus.on('dismissRequests', () => setView({ kind: 'closed' }))
      } catch {
        retryTimer = setTimeout(attach, 250)
      }
    }
    attach()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (unsubBoard) unsubBoard()
      if (unsubDetail) unsubDetail()
      if (unsubReset) unsubReset()
      if (unsubDismiss) unsubDismiss()
    }
  }, [])

  const visible = view.kind !== 'closed'
  const modalGranted = useModalSlot('requests', visible)
  const close = () => setView({ kind: 'closed' })

  return (
    <Modal
      visible={visible && modalGranted}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      statusBarTranslucent={false}
    >
      <StatusBar barStyle={readableOn(theme.colors.background) === '#FFFFFF' ? 'light-content' : 'dark-content'} />
      {/* A native Modal has its own screen bounds; measure its safe area here. */}
      <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
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
      </SafeAreaProvider>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
})
