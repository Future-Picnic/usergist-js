// Default theme + merge helper. Returns a fully-resolved theme that the
// bottom sheet & question components can consume without null-checks.

import type { PromptTheme } from '@usergist/sdk-core/mobile'
import { readableOn, withAlpha } from './color.js'

export { withAlpha }

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
  // Brand font. Host apps must register/bundle the font under this exact
  // family name; if missing the platform falls back to its default sans.
  fontFamily: 'Plus Jakarta Sans',
}

/**
 * Colours derived from the five campaign colours. Every SDK surface reads
 * these instead of fixed greys or white, so any dashboard theme (light,
 * dark, pastel or saturated) stays legible without extra configuration.
 */
export interface SurfaceTokens {
  /** Readable label colour on a primary fill (black or white by contrast). */
  readonly onPrimary: string
  /** Quiet primary wash for selected options. */
  readonly tint: string
  /** Neutral wash for inputs, Close and disabled actions. */
  readonly fill: string
  /** Slightly stronger neutral, used for pressed states. */
  readonly fillStrong: string
  readonly scrim: string
}

export function surfaceTokens(theme: ResolvedTheme): SurfaceTokens {
  return {
    onPrimary: readableOn(theme.colors.primary),
    tint: withAlpha(theme.colors.primary, 0.1),
    fill: withAlpha(theme.colors.text, 0.06),
    fillStrong: withAlpha(theme.colors.text, 0.12),
    scrim: 'rgba(0,0,0,0.45)',
  }
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
