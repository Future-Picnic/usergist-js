// Pure colour helpers for theme-derived tokens. No React Native imports so
// they can be unit-tested directly.

export type Rgb = readonly [number, number, number]

/**
 * Parse the colour formats a theme may carry: #rgb, #rgba, #rrggbb,
 * #rrggbbaa and rgb()/rgba(). Alpha is ignored for contrast purposes.
 * Returns null for anything else (named colours, hsl, malformed input).
 */
export function parseColor(input: string): Rgb | null {
  const value = input.trim()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
  if (hex) {
    const raw = hex[1] ?? ''
    const full = raw.length <= 4 ? raw.split('').map((c) => c + c).join('') : raw
    const channel = (i: number): number => parseInt(full.slice(i, i + 2), 16)
    return [channel(0), channel(2), channel(4)]
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(value)
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map((v) => Number(v))
    if (parts.some((v) => v > 255)) return null
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  return null
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const linear = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
}

/** WCAG contrast ratio between two luminances (1–21). */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Label colour for text on a filled background: whichever of black or white
 * has the greater actual contrast. Unparseable colours fall back to white.
 */
export function readableOn(background: string): '#000000' | '#FFFFFF' {
  const rgb = parseColor(background)
  if (!rgb) return '#FFFFFF'
  const lum = relativeLuminance(rgb)
  return contrastRatio(lum, 0) > contrastRatio(lum, 1) ? '#000000' : '#FFFFFF'
}

/** Apply an alpha to a theme colour; unknown formats fall back to neutral grey. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color)
  if (!rgb) return `rgba(127,127,127,${alpha})`
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}
