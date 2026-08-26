import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { ArmedInAppMessage, InAppCta } from '@usergist/sdk-core/mobile'
import { DEFAULT_THEME, mergeTheme, type ResolvedTheme } from './theme.js'
import type { PromptTheme } from '@usergist/sdk-core/mobile'
import { useModalSlot } from '../internal/modal-coordinator.js'

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
    if (!message || !modalGranted || !isSlide) return

    closingRef.current = false
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

  return (
    <Modal
      transparent={!isFull}
      visible={modalGranted}
      animationType={isSlide ? 'none' : 'fade'}
      onRequestClose={() => dismiss('user')}
    >
      <View style={isFull ? styles.fullRoot : styles.overlayRoot}>
        {!isFull ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: backdropEnabled
                  ? 'rgba(0,0,0,0.4)'
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
              borderTopLeftRadius: isSlide ? theme.radius : undefined,
              borderTopRightRadius: isSlide ? theme.radius : undefined,
              borderRadius: isSlide || isFull ? undefined : theme.radius,
              transform: isSlide ? [{ translateY }] : undefined,
            },
          ]}
        >
          {isSlide ? (
            <View
              style={[styles.handle, { backgroundColor: theme.colors.border }]}
              aria-hidden
            />
          ) : null}
          <Pressable
            onPress={() => dismiss('user')}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={styles.closeBtn}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.fontFamily,
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              ✕
            </Text>
          </Pressable>

          {message.imageUrl ? (
            <Image
              source={{ uri: message.imageUrl }}
              style={isFull ? styles.fullImage : styles.cardImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}

          <View style={styles.content}>
            <Text
              style={[
                styles.title,
                { color: theme.colors.text, fontFamily: theme.fontFamily },
              ]}
            >
              {message.title}
            </Text>
            {message.body ? (
              <Text
                style={[
                  styles.body,
                  { color: theme.colors.subtext, fontFamily: theme.fontFamily },
                ]}
              >
                {message.body}
              </Text>
            ) : null}
          </View>

          {message.ctas.length > 0 ? (
            <View style={styles.ctaRow}>
              {message.ctas.map((cta, i) => {
                const isPrimary = i === 0
                return (
                  <Pressable
                    key={i}
                    onPress={() =>
                      closeWithAnimation(() => onCtaPress(cta, i))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={cta.label}
                    style={[
                      styles.ctaButton,
                      isPrimary
                        ? { backgroundColor: theme.colors.primary }
                        : { borderColor: theme.colors.primary, borderWidth: 1 },
                    ]}
                  >
                    <Text
                      style={{
                        color: isPrimary ? '#ffffff' : theme.colors.primary,
                        fontFamily: theme.fontFamily,
                        fontWeight: '700',
                      }}
                    >
                      {cta.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}
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
    paddingHorizontal: 16,
  },
  fullRoot: {
    flex: 1,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  slideCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  fullCard: {
    flex: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  fullImage: {
    width: '100%',
    height: 240,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  ctaButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
