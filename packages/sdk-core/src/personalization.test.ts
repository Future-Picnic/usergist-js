import { describe, expect, it } from 'vitest'
import {
  personalizationSpecSchema,
  renderPersonalizedContent,
  resolvePersonalizationBindings,
  userPropertiesUpdateSchema,
} from './personalization.js'
import type { PersonalizationSpec } from './types/personalization.js'

const spec: PersonalizationSpec = {
  version: 1,
  missingData: 'skip',
  sources: [
    { id: 'profile', label: 'User information', kind: 'user_property' },
    {
      id: 'watch',
      label: 'Last watched show',
      kind: 'latest_event',
      eventName: 'show_watched',
      lookbackDays: 30,
    },
  ],
  bindings: [
    {
      id: 'name',
      label: 'First name',
      sourceId: 'profile',
      key: 'first_name',
      type: 'string',
      fallback: 'there',
    },
    {
      id: 'show',
      label: 'Show name',
      sourceId: 'watch',
      key: 'show_name',
      type: 'string',
    },
    {
      id: 'id',
      label: 'Show ID',
      sourceId: 'watch',
      key: 'show_id',
      type: 'string',
    },
    {
      id: 'position',
      label: 'Position',
      sourceId: 'watch',
      key: 'position_seconds',
      type: 'number',
      fallback: 0,
    },
  ],
}
const watch = {
  eventId: 'event-a',
  occurredAt: '2026-09-09T12:00:00Z',
  values: {
    show_name: 'Stranger Things',
    show_id: '00123',
    position_seconds: 840,
  },
}
const content = {
  title: 'Hi {{p.name}}, continue {{p.show}}',
  openAction: {
    action: 'json',
    actionJson: {
      action: 'open_show',
      showId: '{{p.id}}',
      positionSeconds: '{{p.position}}',
    },
  },
}

describe('personalization', () => {
  it('ignores removed fields and omits a missing optional image', () => {
    const imageSpec: PersonalizationSpec = {
      ...spec,
      bindings: [
        ...spec.bindings,
        {
          id: 'artwork',
          label: 'Artwork',
          sourceId: 'watch',
          key: 'image_url',
          type: 'string',
        },
      ],
    }
    const result = renderPersonalizedContent(
      { title: 'Hello {{p.name}}', imageUrl: '{{p.artwork}}' },
      resolvePersonalizationBindings(imageSpec, {}),
    )
    expect(result.content).toEqual({ title: 'Hello there', imageUrl: null })
    expect(result.resolution.status).toBe('using_fallback')
    expect(result.resolution.issues).toEqual([])
  })
  it('keeps destination IDs required when also used in an image', () => {
    const result = renderPersonalizedContent(
      {
        imageUrl: 'https://example.com/{{p.id}}.png',
        openAction: { action: 'json', actionJson: { id: '{{p.id}}' } },
      },
      resolvePersonalizationBindings(spec, {}),
    )
    expect(result.resolution.status).toBe('skipped')
  })
  it('rejects dynamically substituted URL authorities and non-HTTPS artwork', () => {
    const resolution = resolvePersonalizationBindings(spec, { watch })
    expect(
      renderPersonalizedContent(
        { deepLink: 'https://{{p.id}}/show' },
        resolution,
      ).resolution.status,
    ).toBe('skipped')
    expect(
      renderPersonalizedContent(
        { imageUrl: 'file:///private/image.png' },
        resolution,
      ).resolution.status,
    ).toBe('skipped')
  })
  it('keeps the label, string ID and numeric position on the same source', () => {
    const result = renderPersonalizedContent(
      content,
      resolvePersonalizationBindings(spec, {
        profile: { values: { first_name: 'Liran' } },
        watch,
      }),
    )
    expect(result.resolution.status).toBe('ready')
    expect(result.content.title).toBe('Hi Liran, continue Stranger Things')
    expect(result.content.openAction.actionJson).toEqual({
      action: 'open_show',
      showId: '00123',
      positionSeconds: 840,
    })
    expect(result.resolution.sources.watch?.eventId).toBe('event-a')
  })
  it('uses optional fallbacks but skips missing essential show IDs', () => {
    const withoutId = { ...watch, values: { show_name: 'Stranger Things' } }
    const result = renderPersonalizedContent(
      content,
      resolvePersonalizationBindings(spec, { watch: withoutId }),
    )
    expect(result.resolution.status).toBe('skipped')
    expect(result.resolution.fallbackBindingIds).toEqual(['name', 'position'])
    expect(result.resolution.issues).toContainEqual(
      expect.objectContaining({ bindingId: 'id', code: 'missing' }),
    )
  })
  it('does not lose zero, false, literal dots, quotes or Unicode', () => {
    const local: PersonalizationSpec = {
      version: 1,
      missingData: 'skip',
      sources: [{ id: 'p', kind: 'user_property', label: 'Profile' }],
      bindings: [
        {
          id: 'zero',
          sourceId: 'p',
          label: 'Zero',
          key: 'a.b',
          type: 'number',
        },
        {
          id: 'flag',
          sourceId: 'p',
          label: 'Flag',
          key: 'flag',
          type: 'boolean',
        },
        {
          id: 'text',
          sourceId: 'p',
          label: 'Text',
          key: 'text',
          type: 'string',
        },
      ],
    }
    const resolution = resolvePersonalizationBindings(local, {
      p: { values: { 'a.b': 0, flag: false, text: '"שלום" {{braces}} 🎬' } },
    })
    const result = renderPersonalizedContent(
      {
        title: '{{p.text}}',
        actionJson: {
          zero: '{{p.zero}}',
          flag: '{{p.flag}}',
          text: 'Value: {{p.zero}}',
        },
      },
      resolution,
    )
    expect(result.resolution.status).toBe('ready')
    expect(result.content).toEqual({
      title: '"שלום" {{braces}} 🎬',
      actionJson: { zero: 0, flag: false, text: 'Value: 0' },
    })
  })
  it('never substitutes question IDs, scores or branching', () => {
    const question = { id: '{{p.id}}', title: 'Rate {{p.show}}', score: 10 }
    const result = renderPersonalizedContent(
      {
        flow: {
          questions: [question],
          branches: [{ targetQuestionId: '{{p.id}}' }],
        },
      },
      resolvePersonalizationBindings(spec, { watch }),
    )
    expect(result.content.flow.questions[0]).toEqual({
      ...question,
      title: 'Rate Stranger Things',
    })
    expect(result.content.flow.branches).toEqual([
      { targetQuestionId: '{{p.id}}' },
    ])
  })
  it('encodes URL components and rejects unsafe destinations', () => {
    const resolution = resolvePersonalizationBindings(spec, {
      watch: { ...watch, values: { ...watch.values, show_id: 'a/b?x=1' } },
    })
    expect(
      renderPersonalizedContent(
        { deepLink: 'movies://show/{{p.id}}' },
        resolution,
      ).content.deepLink,
    ).toBe('movies://show/a%2Fb%3Fx%3D1')
    expect(
      renderPersonalizedContent({ deepLink: 'javascript:alert(1)' }, resolution)
        .resolution.status,
    ).toBe('skipped')
  })
  it('does not hide invalid values behind a fallback', () => {
    const result = resolvePersonalizationBindings(spec, {
      watch: { ...watch, values: { ...watch.values, position_seconds: '840' } },
    })
    expect(result.status).toBe('skipped')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ bindingId: 'position', code: 'type_mismatch' }),
    )
  })
  it('rejects unknown or malformed tokens', () => {
    const resolution = resolvePersonalizationBindings(spec, { watch })
    expect(
      renderPersonalizedContent({ title: '{{p.missing}}' }, resolution)
        .resolution.status,
    ).toBe('skipped')
    expect(
      renderPersonalizedContent({ title: '{{bad syntax}}' }, resolution)
        .resolution.status,
    ).toBe('skipped')
  })
  it('validates source identities, history windows and fallback types', () => {
    expect(personalizationSpecSchema.safeParse(spec).success).toBe(true)
    expect(
      personalizationSpecSchema.safeParse({
        ...spec,
        sources: [spec.sources[0], spec.sources[0]],
      }).success,
    ).toBe(false)
    expect(
      personalizationSpecSchema.safeParse({
        ...spec,
        bindings: [{ ...spec.bindings[0], fallback: 123 }],
      }).success,
    ).toBe(false)
    expect(
      personalizationSpecSchema.safeParse({
        ...spec,
        sources: [{ ...spec.sources[1], lookbackDays: 91 }],
      }).success,
    ).toBe(false)
  })
  it('rejects contradictory and unsafe profile updates', () => {
    const mutationId = '68a88280-c723-4f5f-a98b-fc33887d52c3'
    expect(
      userPropertiesUpdateSchema.safeParse({
        mutationId,
        set: { plan: 'pro' },
        unset: ['plan'],
      }).success,
    ).toBe(false)
    expect(
      userPropertiesUpdateSchema.safeParse({
        mutationId,
        set: { constructor: 'bad' },
      }).success,
    ).toBe(false)
    expect(
      userPropertiesUpdateSchema.safeParse({
        mutationId,
        set: { show_id: '00123', position: 0 },
      }).success,
    ).toBe(true)
  })
})
