import { describe, expect, it } from 'vitest'
import {
  defaultEventTrigger,
  defaultTriggerSpec,
  emptyAudienceSpec,
  type AudienceSpec,
  type EventTrigger,
  type TriggerSpec,
} from './targeting.js'
import {
  defaultThemePreset,
  getThemePresetById,
  THEME_PRESETS,
} from './themes.js'

describe('AudienceSpec defaults', () => {
  it('emptyAudienceSpec returns a fresh "everyone" spec', () => {
    const spec = emptyAudienceSpec()
    expect(spec.version).toBe(1)
    expect(spec.mode).toBe('everyone')
    expect(spec.combinator).toBe('all')
    expect(spec.conditions).toEqual([])
  })

  it('AudienceSpec is structurally typed and discriminable', () => {
    const spec: AudienceSpec = {
      version: 1,
      mode: 'match',
      combinator: 'all',
      conditions: [
        { kind: 'segment', op: 'is', segmentIds: ['s-1'] },
        { kind: 'country', op: 'is_any_of', values: ['US'] },
        { kind: 'platform', op: 'is', values: ['ios'] },
      ],
    }
    const segment = spec.conditions.find((c) => c.kind === 'segment')
    expect(segment?.kind).toBe('segment')
    if (segment?.kind === 'segment') expect(segment.segmentIds).toContain('s-1')
  })
})

describe('TriggerSpec defaults', () => {
  it('defaultTriggerSpec returns app_open', () => {
    const t: TriggerSpec = defaultTriggerSpec()
    expect(t.kind).toBe('app_open')
  })

  it('defaultEventTrigger sets mode=every and the given event name', () => {
    const t: EventTrigger = defaultEventTrigger('purchase_completed')
    expect(t.kind).toBe('event')
    expect(t.eventName).toBe('purchase_completed')
    expect(t.occurrence?.mode).toBe('every')
  })
})

describe('Theme presets', () => {
  it('THEME_PRESETS exposes 12 named cards', () => {
    expect(THEME_PRESETS).toHaveLength(12)
    const ids = THEME_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length) // ids unique
    expect(ids).toContain('minimal')
    expect(ids).toContain('aurora')
  })

  it('every preset has 3 swatches and full colors', () => {
    for (const p of THEME_PRESETS) {
      expect(p.swatches).toHaveLength(3)
      expect(p.colors.primary).toMatch(/^#/)
      expect(p.colors.background).toMatch(/^#/)
      expect(p.colors.text).toMatch(/^#/)
    }
  })

  it('getThemePresetById finds known ids', () => {
    expect(getThemePresetById('minimal')?.name).toBe('Minimal')
    expect(getThemePresetById('does-not-exist')).toBeUndefined()
  })

  it('defaultThemePreset returns the first preset', () => {
    expect(defaultThemePreset().id).toBe(THEME_PRESETS[0]!.id)
  })
})
