import { describe, expect, it } from 'vitest'
import { THEME_PRESETS } from './themes.js'
import {
  brandTokensFromPreset,
  inAppColorsFromBrandTokens,
  promptThemeFromBrandTokens,
  requestAccentFromBrandTokens,
} from './brand.js'

describe('brand theme pillar adapters', () => {
  const preset = THEME_PRESETS[0]!
  const tokens = brandTokensFromPreset(preset)

  it('preserves the complete reusable token contract', () => {
    expect(tokens).toEqual({
      colors: {
        primary: preset.colors.primary,
        background: preset.colors.background,
        text: preset.colors.text,
        subtext: preset.colors.subtext,
        border: preset.colors.border,
      },
      radius: preset.radius,
      fontFamily: preset.fontFamily,
    })
  })

  it('maps Feedback and Survey to the identical complete theme', () => {
    const feedback = promptThemeFromBrandTokens(tokens)
    const survey = promptThemeFromBrandTokens(tokens)
    expect(feedback).toEqual(survey)
    expect(feedback).toEqual(tokens)
  })

  it('maps only documented tokens for In-app and Requests', () => {
    expect(inAppColorsFromBrandTokens(tokens)).toEqual({
      backgroundColor: tokens.colors.background,
      accentColor: tokens.colors.primary,
    })
    expect(requestAccentFromBrandTokens(tokens)).toBe(tokens.colors.primary)
  })
})
