import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import type { ArmedInAppMessage, InAppCta } from '@usergist/sdk-core/mobile'
import { DEFAULT_THEME, mergeTheme, surfaceTokens, withAlpha, type ResolvedTheme } from './theme.js'
import type { PromptTheme } from '@usergist/sdk-core/mobile'
import { useModalSlot } from '../internal/modal-coordinator.js'
import { CONTENT_MAX_WIDTH, useSurfaceLayout } from './SurfaceControls.js'
import { InAppMessageLayout } from './InAppMessageLayout.js'

interface Props {
  readonly message: ArmedInAppMessage | null
  readonly themeOverride?: ResolvedTheme | null
  readonly onCtaPress: (cta: InAppCta, index: number) => void
  readonly onDismiss: (reason: 'user' | 'auto') => void
}

// Single component that renders all 3 formats (modal, modal_full,
// slideup). RN <Modal> is the chrome; layout switches per-format.
// Pure JS — no native bridge — so it ships through the same SDK pack
// that feedback / surveys / push use.
export function InAppMessageView({
  message,
  themeOverride,
  onCtaPress,
  onDismiss,
}: Props): React.ReactElement | null {
  const modalGranted = useModalSlot('inapp', Boolean(message))
  const layout = useSurfaceLayout()
  const isFull = message?.format === 'modal_full'
  const isSlide = message?.format === 'slideup'
  const backdropEnabled = message?.backdropEnabled !== false
  const sheetProgress = useRef(new Animated.Value(0)).current
  const backdropProgress = useRef(new Animated.Value(0)).current
  const closingRef = useRef(false)
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false)
  const theme: ResolvedTheme = React.useMemo(() => {
    const override: PromptTheme | undefined =
      message?.backgroundColor || message?.accentColor
        ? {
            colors: {
              background: message?.backgroundColor ?? undefined,
              primary: message?.accentColor ?? undefined,
            },
          }
        : undefined
    if (themeOverride) return mergeTheme(themeOverride, override)
    return mergeTheme(DEFAULT_THEME, override)
  }, [themeOverride, message?.backgroundColor, message?.accentColor])

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (!message || !modalGranted) return
    // The same campaign may be presented repeatedly. A completed close from
    // the previous presentation must never leave the next modal inert.
    closingRef.current = false
  }, [message, modalGranted])

  useEffect(() => {
    if (!message || !modalGranted || !isSlide) return

    sheetProgress.stopAnimation()
    backdropProgress.stopAnimation()
    sheetProgress.setValue(reduceMotionEnabled ? 1 : 0)
    backdropProgress.setValue(reduceMotionEnabled ? 1 : 0)
    if (reduceMotionEnabled) return

    const frame = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(sheetProgress, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropProgress, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start()
    })

    return () => {
      cancelAnimationFrame(frame)
      sheetProgress.stopAnimation()
      backdropProgress.stopAnimation()
    }
  }, [
    backdropProgress,
    isSlide,
    message,
    modalGranted,
    reduceMotionEnabled,
    sheetProgress,
  ])

  const closeWithAnimation = useCallback(
    (afterClose: () => void): void => {
      if (closingRef.current) return
      closingRef.current = true

      if (!isSlide || reduceMotionEnabled) {
        afterClose()
        return
      }

      Animated.parallel([
        Animated.timing(sheetProgress, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropProgress, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => afterClose())
    }, [
      backdropProgress,
      isSlide,
      reduceMotionEnabled,
      sheetProgress,
    ],
  )

  const dismiss = useCallback(
    (reason: 'user' | 'auto' = 'user') =>
      closeWithAnimation(() => onDismiss(reason)),
    [closeWithAnimation, onDismiss],
  )

  // Auto-dismiss for slide-up. Always run the effect (hooks rule); the
  // cleanup is a no-op when there's nothing to schedule.
  useEffect(() => {
    if (!message || !modalGranted) return
    if (message.format !== 'slideup') return
    const seconds = message.autoDismissSeconds
    if (!seconds || seconds <= 0) return
    const t = setTimeout(() => dismiss('auto'), seconds * 1000)
    return () => clearTimeout(t)
  }, [dismiss, message, modalGranted])

  if (!message) return null

  const translateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get('window').height, 0],
  })
  // Slide-up floats as a card above the home indicator, centred and capped
  // to a readable width in landscape so it never meets the notch.
  const slideAvailable = layout.width - layout.left - layout.right - 24
  const slideWidth = layout.landscape ? Math.min(slideAvailable, CONTENT_MAX_WIDTH) : slideAvailable

  return (
    <Modal
      transparent={!isFull}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      visible={modalGranted}
      animationType={isSlide ? 'none' : 'fade'}
      onRequestClose={() => dismiss('user')}
    >
      <View style={[
        isFull ? styles.fullRoot : styles.overlayRoot,
        { paddingTop: layout.top + 8, paddingBottom: Math.max(layout.bottom, 12),
          paddingLeft: layout.left + (isFull ? 0 : 16), paddingRight: layout.right + (isFull ? 0 : 16),
          backgroundColor: isFull ? theme.colors.background : undefined },
      ]}>
        {!isFull ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: backdropEnabled
                  ? surfaceTokens(theme).scrim
                  : 'transparent',
                opacity: isSlide ? backdropProgress : 1,
              },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => dismiss('user')}
              accessibilityLabel="Dismiss"
            />
          </Animated.View>
        ) : null}
        <Animated.View
          style={[
            isFull ? styles.fullCard : isSlide ? styles.slideCard : styles.modalCard,
            {
              backgroundColor: theme.colors.background,
              borderRadius: isFull ? undefined : theme.radius,
              transform: isSlide ? [{ translateY }] : undefined,
              ...(!isFull ? { borderColor: withAlpha(theme.colors.text, 0.08) } : {}),
              ...(!isFull && layout.landscape ? { maxWidth: CONTENT_MAX_WIDTH } : {}),
              ...(isSlide ? {
                width: slideWidth,
                left: (layout.width - slideWidth) / 2,
                // Stay within the safe height; long content scrolls inside.
                maxHeight: Math.max(160, layout.height - layout.top - Math.max(layout.bottom, 12) - 24),
                bottom: Math.max(layout.bottom, 12) + 4,
              } : {}),
            },
          ]}
        >
          <InAppMessageLayout
            message={message}
            format={isFull ? 'full' : isSlide ? 'slide' : 'card'}
            theme={theme}
            landscape={layout.landscape}
            maxFooterHeight={Math.max(120, Math.round(layout.height * 0.4))}
            onClose={() => dismiss('user')}
            onCta={(cta, i) => closeWithAnimation(() => onCtaPress(cta, i))}
          />
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullRoot: {
    flex: 1,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    maxHeight: '100%',
    flexShrink: 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
  slideCard: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fullCard: {
    flex: 1,
    overflow: 'hidden',
  },
})
