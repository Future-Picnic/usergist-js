// The same contrast rule as the mobile SDKs. Browser normalization supports
// host-defined CSS color names as well as hex/rgb theme values.
export function onPrimary(primary: string, background: string): string {
  const sample = document.createElement('span')
  sample.style.color = primary
  sample.style.display = 'none'
  document.body.append(sample)
  const resolved = getComputedStyle(sample).color || primary
  sample.style.color = background
  const base = getComputedStyle(sample).color || background
  sample.remove()
  const parse = (value: string): number[] | null => {
    const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value)
    if (hex) {
      const raw = hex[1]!
      const expanded = raw.length < 5 ? [...raw].map(c => c + c).join('') : raw
      return [0, 2, 4].map(i => parseInt(expanded.slice(i, i + 2), 16)).concat(expanded.length === 8 ? parseInt(expanded.slice(6), 16) / 255 : 1)
    }
    const channels = value.match(/[\d.]+/g)?.map(Number)
    return /^rgba?\(/.test(value) && channels && channels.length >= 3 ? channels : null
  }
  const rgb = parse(resolved) ?? parse(primary)
  if (!rgb) return '#FFFFFF'
  const bg = parse(base) ?? [255, 255, 255]
  const alpha = rgb[3] ?? 1
  const linear = rgb.slice(0, 3).map((v, i) => {
    const c = (v * alpha + (bg[i] ?? 255) * (1 - alpha)) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
  return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000000' : '#FFFFFF'
}
