import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor, readableOn, relativeLuminance, withAlpha } from './color.js'

const ratioOn = (bg: string, fg: string): number =>
  contrastRatio(relativeLuminance(parseColor(bg)!), relativeLuminance(parseColor(fg)!))

describe('readableOn', () => {
  it('picks black on orange #D97706 (white is only ~3.2:1)', () => {
    expect(readableOn('#D97706')).toBe('#000000')
    expect(ratioOn('#D97706', '#000000')).toBeGreaterThan(ratioOn('#D97706', '#FFFFFF'))
  })

  it('picks the higher-contrast label for midtones', () => {
    for (const c of ['#7C3AED', '#2563EB', '#16A34A', '#E11D48', '#0D9488', '#808080']) {
      const chosen = readableOn(c)
      const other = chosen === '#000000' ? '#FFFFFF' : '#000000'
      expect(ratioOn(c, chosen)).toBeGreaterThanOrEqual(ratioOn(c, other))
    }
  })

  it('uses black on light and white on dark primaries', () => {
    expect(readableOn('#FACC15')).toBe('#000000')
    expect(readableOn('#5EEAD4')).toBe('#000000')
    expect(readableOn('#FFFFFF')).toBe('#000000')
    expect(readableOn('#111111')).toBe('#FFFFFF')
    expect(readableOn('#3B1764')).toBe('#FFFFFF')
  })

  it('accepts short, alpha and rgb() formats', () => {
    expect(readableOn('#fff')).toBe('#000000')
    expect(readableOn('#000f')).toBe('#FFFFFF')
    expect(readableOn('#D97706FF')).toBe('#000000')
    expect(readableOn('rgb(17, 17, 17)')).toBe('#FFFFFF')
    expect(readableOn('rgba(250,204,21,0.9)')).toBe('#000000')
  })

  it('falls back to white for unsupported values', () => {
    expect(readableOn('purple')).toBe('#FFFFFF')
    expect(readableOn('#12')).toBe('#FFFFFF')
  })
})

describe('withAlpha', () => {
  it('converts supported colours and falls back to neutral grey', () => {
    expect(withAlpha('#7C3AED', 0.1)).toBe('rgba(124,58,237,0.1)')
    expect(withAlpha('#abc', 0.5)).toBe('rgba(170,187,204,0.5)')
    expect(withAlpha('hsl(0,0%,0%)', 0.2)).toBe('rgba(127,127,127,0.2)')
  })
})
