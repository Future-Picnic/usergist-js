// Default theme + merge helper. Returns a fully-resolved theme that the
// bottom sheet & question components can consume without null-checks.

import type { PromptTheme } from '@ritmus/sdk-core'

export interface ResolvedTheme {
  readonly colors: {
    readonly primary: string
    readonly background: string
    readonly text: string
    readonly subtext: string
    readonly border: string
  }
  readonly radius: number
  readonly fontFamily: string | undefined
}

export const DEFAULT_THEME: ResolvedTheme = {
  colors: {
    primary: '#111111',
    background: '#FFFFFF',
    text: '#0B0B0B',
    subtext: '#6B6B6B',
    border: '#E5E5E5',
  },
  radius: 20,
  fontFamily: undefined,
}

export function mergeTheme(
  base: ResolvedTheme,
  override?: PromptTheme,
): ResolvedTheme {
  if (!override) return base
  return {
    colors: {
      primary: override.colors?.primary ?? base.colors.primary,
      background: override.colors?.background ?? base.colors.background,
      text: override.colors?.text ?? base.colors.text,
      subtext: override.colors?.subtext ?? base.colors.subtext,
      border: override.colors?.border ?? base.colors.border,
    },
    radius: override.radius ?? base.radius,
    fontFamily: override.fontFamily ?? base.fontFamily,
  }
}
