// Slide-up animation helper for the bottom sheet.
// Uses Animated + spring for a native feel without any native modules.

import { Animated, Easing } from 'react-native'

export function animateIn(value: Animated.Value): void {
  Animated.spring(value, {
    toValue: 1,
    damping: 18,
    mass: 1,
    stiffness: 160,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
    useNativeDriver: true,
  }).start()
}

export function animateOut(
  value: Animated.Value,
  onComplete: () => void,
): void {
  Animated.timing(value, {
    toValue: 0,
    duration: 220,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start(() => onComplete())
}
