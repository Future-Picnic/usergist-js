import type { PromptTheme } from './prompt.js'
import type { ThemePreset } from './themes.js'

export type BrandPillar = 'feedback' | 'survey' | 'inapp' | 'requests'
export type ThemeMode = 'app_default' | 'custom'

export interface BrandThemeTokens {
  readonly colors: {
    readonly primary: string
    readonly background: string
    readonly text: string
    readonly subtext: string
    readonly border: string
  }
  readonly radius: number
  readonly fontFamily: string
}

export type BrandThemeRef = `preset:${string}` | `custom:${string}`

export interface BrandTheme {
  readonly ref: BrandThemeRef
  readonly id: string
  readonly kind: 'preset' | 'custom'
  readonly name: string
  readonly description?: string
  readonly tokens: BrandThemeTokens
  readonly swatches: readonly [string, string, string]
  readonly editable: boolean
  readonly assignedPillars: ReadonlyArray<BrandPillar>
  readonly createdAt?: string
  readonly updatedAt?: string
}

export type BrandThemeDefaults = Readonly<Record<BrandPillar, BrandThemeRef>>

export interface AppBrandSettings {
  readonly appId: string
  readonly themes: ReadonlyArray<BrandTheme>
  readonly defaults: BrandThemeDefaults
  readonly resolvedDefaults: Readonly<Record<BrandPillar, BrandThemeTokens>>
  readonly updatedAt: string
}

export interface CreateBrandThemeRequest {
  readonly name: string
  readonly tokens: BrandThemeTokens
}

export interface UpdateBrandThemeRequest {
  readonly name?: string
  readonly tokens?: BrandThemeTokens
}

export interface UpdateBrandThemeDefaultsRequest {
  readonly defaults: BrandThemeDefaults
}

export function brandTokensFromPreset(
  preset: Pick<ThemePreset, 'colors' | 'radius' | 'fontFamily'>,
): BrandThemeTokens {
  return {
    colors: {
      primary: preset.colors.primary,
      background: preset.colors.background,
      text: preset.colors.text,
      subtext: preset.colors.subtext,
      border: preset.colors.border,
    },
    radius: preset.radius,
    fontFamily: preset.fontFamily,
  }
}

export function promptThemeFromBrandTokens(tokens: BrandThemeTokens): PromptTheme {
  return {
    colors: { ...tokens.colors },
    radius: tokens.radius,
    fontFamily: tokens.fontFamily,
  }
}

export function inAppColorsFromBrandTokens(tokens: BrandThemeTokens): {
  readonly backgroundColor: string
  readonly accentColor: string
} {
  return {
    backgroundColor: tokens.colors.background,
    accentColor: tokens.colors.primary,
  }
}

export function requestAccentFromBrandTokens(tokens: BrandThemeTokens): string {
  return tokens.colors.primary
}
