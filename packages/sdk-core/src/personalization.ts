import { z } from 'zod'
import type {
  PersonalizationBinding,
  PersonalizationIssue,
  PersonalizationResolution,
  PersonalizationScalar,
  PersonalizationSourceValue,
  PersonalizationSpec,
} from './types/personalization.js'

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
const key = z
  .string()
  .min(1)
  .max(120)
  .refine(
    (v) => !['__proto__', 'prototype', 'constructor'].includes(v),
    'Reserved property key',
  )
const scalar = z.union([
  z.string().max(8192),
  z.number().finite(),
  z.boolean(),
  z.null(),
])
const baseSource = { id, label: z.string().min(1).max(120) }
const filterSchema = z.object({
  key,
  op: z.enum([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'nin',
    'contains',
    'starts_with',
    'exists',
    'not_exists',
  ]),
  value: z
    .union([
      z.string(),
      z.number().finite(),
      z.boolean(),
      z.array(z.union([z.string(), z.number().finite()])).max(100),
    ])
    .optional(),
})

export const personalizationSpecSchema = z
  .object({
    version: z.literal(1),
    sources: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ ...baseSource, kind: z.literal('user_property') }),
          z.object({ ...baseSource, kind: z.literal('trigger_event') }),
          z.object({ ...baseSource, kind: z.literal('send_data') }),
          z.object({ ...baseSource, kind: z.literal('app') }),
          z.object({ ...baseSource, kind: z.literal('now') }),
          z.object({
            ...baseSource,
            kind: z.literal('latest_event'),
            eventName: z.string().min(1).max(120),
            lookbackDays: z.number().int().min(1).max(90),
            filters: z.array(filterSchema).max(8).optional(),
          }),
        ]),
      )
      .max(16),
    bindings: z
      .array(
        z.object({
          id,
          label: z.string().min(1).max(120),
          sourceId: id,
          key,
          type: z.enum(['string', 'number', 'boolean', 'date']),
          fallback: scalar.optional(),
        }),
      )
      .max(64),
    missingData: z.literal('skip'),
  })
  .superRefine((spec, ctx) => {
    const sources = new Set(spec.sources.map((source) => source.id))
    if (sources.size !== spec.sources.length)
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Source IDs must be unique',
      })
    if (
      spec.sources.filter((source) => source.kind === 'latest_event').length > 4
    )
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Use at most four activity sources',
      })
    const bindings = new Set<string>()
    spec.bindings.forEach((binding, index) => {
      if (bindings.has(binding.id))
        ctx.addIssue({
          code: 'custom',
          path: ['bindings', index, 'id'],
          message: 'Field IDs must be unique',
        })
      bindings.add(binding.id)
      if (!sources.has(binding.sourceId))
        ctx.addIssue({
          code: 'custom',
          path: ['bindings', index, 'sourceId'],
          message: 'Choose an existing source',
        })
      if (
        binding.fallback !== undefined &&
        (isMissing(binding.fallback) ||
          !matchesType(binding.fallback, binding.type))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['bindings', index, 'fallback'],
          message: 'Fallback must be a non-empty value of the selected type',
        })
    })
  })

export const userPropertiesUpdateSchema = z
  .object({
    mutationId: z.string().uuid(),
    set: z
      .record(key, scalar)
      .refine(
        (v) => Object.keys(v).length <= 64,
        'Update at most 64 properties',
      )
      .optional(),
    unset: z.array(key).max(64).optional(),
  })
  .superRefine((update, ctx) => {
    if (!Object.keys(update.set ?? {}).length && !update.unset?.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Supply properties to set or remove',
      })
    if (update.unset?.some((name) => Object.hasOwn(update.set ?? {}, name)))
      ctx.addIssue({
        code: 'custom',
        message: 'A property cannot be set and removed in the same update',
      })
  })

function isMissing(value: unknown): boolean {
  return value == null || (typeof value === 'string' && !value.trim())
}

function matchesType(
  value: unknown,
  type: PersonalizationBinding['type'],
): boolean {
  if (type === 'date')
    return typeof value === 'string' && !Number.isNaN(Date.parse(value))
  return (
    typeof value === type &&
    (typeof value !== 'number' || Number.isFinite(value))
  )
}

export function resolvePersonalizationBindings(
  spec: PersonalizationSpec,
  sources: Readonly<Record<string, PersonalizationSourceValue>>,
): PersonalizationResolution {
  const values: Record<string, PersonalizationScalar> = Object.create(null)
  const issues: PersonalizationIssue[] = []
  const fallbackBindingIds: string[] = []
  for (const binding of spec.bindings) {
    const source = sources[binding.sourceId]?.values
    const value =
      source && Object.hasOwn(source, binding.key)
        ? source[binding.key]
        : undefined
    const missing = isMissing(value)
    if (!missing && matchesType(value, binding.type))
      values[binding.id] = value!
    else if (missing && binding.fallback !== undefined) {
      values[binding.id] = binding.fallback
      fallbackBindingIds.push(binding.id)
    } else
      issues.push({
        code: missing ? 'missing' : 'type_mismatch',
        bindingId: binding.id,
        message: missing
          ? `${binding.label} is missing`
          : `${binding.label} must be ${binding.type}`,
      })
  }
  return {
    status: issues.length
      ? 'skipped'
      : fallbackBindingIds.length
      ? 'using_fallback'
      : 'ready',
    values,
    fallbackBindingIds,
    issues,
    sources,
  }
}

const TOKEN = /\{\{\s*p\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g
const WHOLE_TOKEN = /^\{\{\s*p\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/

export function personalizationToken(bindingId: string): string {
  return `{{p.${bindingId}}}`
}

/** Resolve only explicit template values. JSON keys and substituted values are never evaluated. */
export function renderPersonalizedValue(
  input: unknown,
  values: Readonly<Record<string, PersonalizationScalar>>,
  issues: PersonalizationIssue[],
  path = '',
  mode: 'text' | 'json' | 'url' = 'text',
): unknown {
  if (typeof input === 'string') {
    const whole = WHOLE_TOKEN.exec(input)
    const lookup = (bindingId: string): PersonalizationScalar => {
      if (Object.hasOwn(values, bindingId)) return values[bindingId]!
      issues.push({
        code: 'unknown_binding',
        bindingId,
        path,
        message: `No value is available for ${bindingId}`,
      })
      return null
    }
    if (mode === 'json' && whole) return lookup(whole[1]!)
    // Inspect the template before replacing: a supplied value may legitimately contain braces.
    if (/\{\{|\}\}/.test(input.replace(TOKEN, '')))
      issues.push({
        code: 'invalid_template',
        path,
        message: 'Insert a valid dynamic field',
      })
    const result = input.replace(TOKEN, (_, bindingId: string) => {
      const value = lookup(bindingId)
      return mode === 'url' && !whole
        ? encodeURIComponent(String(value ?? ''))
        : String(value ?? '')
    })
    if (mode === 'url' && result) {
      try {
        const url = new URL(result)
        if (
          ['javascript:', 'data:', 'file:', 'vbscript:'].includes(url.protocol)
        )
          throw new Error('unsafe')
        // The origin/scheme must be static unless the entire field is a URL binding.
        if (!whole && /\{\{/.test(input.split(/:\/\//)[0] ?? ''))
          throw new Error('dynamic scheme')
        if (
          !whole &&
          /\{\{/.test(
            input.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1] ?? '',
          )
        )
          throw new Error('dynamic authority')
      } catch {
        issues.push({
          code: 'invalid_destination',
          path,
          message:
            'The resolved destination must be a valid app link or web URL',
        })
      }
    }
    return result
  }
  if (Array.isArray(input))
    return input.map((item, index) =>
      renderPersonalizedValue(item, values, issues, `${path}/${index}`, mode),
    )
  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = Object.create(null)
    for (const [name, value] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(name)) {
        issues.push({
          code: 'invalid_template',
          path,
          message: 'Reserved object key',
        })
        continue
      }
      result[name] = renderPersonalizedValue(
        value,
        values,
        issues,
        `${path}/${name}`,
        mode,
      )
    }
    return result
  }
  return input
}

/** Display-only keys: identifiers, scores, branching and targeting are always kept verbatim. */
const TEXT_KEYS = new Set([
  'title',
  'body',
  'subtitle',
  'headline',
  'label',
  'placeholder',
  'followUp',
  'lowLabel',
  'highLabel',
  'description',
  'buttonText',
  'submitLabel',
  'nextLabel',
  'backLabel',
  'text',
])
const URL_KEYS = new Set(['imageUrl', 'deepLink', 'target'])
const CONTENT_KEYS = new Set([
  'questions',
  'options',
  'ctas',
  'cta',
  'actionButtons',
  'flow',
  'welcome',
  'thankYou',
  'completion',
  'endScreen',
  'openAction',
])

/** Records where a field is used, excluding campaign metadata and targeting. */
export function personalizationUsage(
  content: unknown,
): Map<string, Set<string>> {
  const usage = new Map<string, Set<string>>()
  const scan = (value: unknown, field: string) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(TOKEN)) {
        const fields = usage.get(match[1]!) ?? new Set<string>()
        fields.add(field)
        usage.set(match[1]!, fields)
      }
    } else if (Array.isArray(value)) value.forEach((item) => scan(item, field))
    else if (value && typeof value === 'object')
      Object.values(value).forEach((item) => scan(item, field))
  }
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (
        TEXT_KEYS.has(key) ||
        URL_KEYS.has(key) ||
        key === 'actionJson' ||
        key === 'payloadExtras'
      )
        scan(item, key)
      else if (CONTENT_KEYS.has(key)) walk(item)
    }
  }
  walk(content)
  return usage
}

export function renderPersonalizedContent<T>(
  content: T,
  resolution: PersonalizationResolution,
): {
  content: T
  resolution: PersonalizationResolution
} {
  const usage = personalizationUsage(content)
  const onlyOptionalImage = (id: string) =>
    usage.get(id)?.size === 1 && usage.get(id)?.has('imageUrl')
  const issues = resolution.issues.filter(
    (issue) =>
      !issue.bindingId ||
      (usage.has(issue.bindingId) &&
        !(issue.code === 'missing' && onlyOptionalImage(issue.bindingId))),
  )
  const fallbacks = resolution.fallbackBindingIds.filter((id) => usage.has(id))
  const walk = (value: unknown, path = ''): unknown => {
    if (Array.isArray(value))
      return value.map((item, index) => walk(item, `${path}/${index}`))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => {
        const childPath = `${path}/${name}`
        if (TEXT_KEYS.has(name) && typeof item === 'string')
          return [
            name,
            renderPersonalizedValue(item, resolution.values, issues, childPath),
          ]
        if (URL_KEYS.has(name) && typeof item === 'string') {
          if (
            name === 'imageUrl' &&
            [...item.matchAll(TOKEN)].some((match) =>
              resolution.issues.some(
                (issue) =>
                  issue.bindingId === match[1] && issue.code === 'missing',
              ),
            )
          )
            return [name, null]
          // custom_event targets are event identifiers, not destinations.
          const isEvent =
            name === 'target' &&
            (value as { action?: string }).action === 'custom_event'
          const rendered = renderPersonalizedValue(
            item,
            resolution.values,
            issues,
            childPath,
            isEvent ? 'text' : 'url',
          )
          if (
            name === 'imageUrl' &&
            rendered &&
            !String(rendered).startsWith('https://')
          )
            issues.push({
              code: 'invalid_destination',
              path: childPath,
              message: 'Image URLs must use HTTPS',
            })
          return [name, rendered]
        }
        if (name === 'actionJson' || name === 'payloadExtras')
          return [
            name,
            renderPersonalizedValue(
              item,
              resolution.values,
              issues,
              childPath,
              'json',
            ),
          ]
        if (CONTENT_KEYS.has(name)) return [name, walk(item, childPath)]
        return [name, item]
      }),
    )
  }
  const rendered = walk(content) as T
  return {
    content: rendered,
    resolution: {
      ...resolution,
      fallbackBindingIds: fallbacks,
      status: issues.length
        ? 'skipped'
        : fallbacks.length
        ? 'using_fallback'
        : 'ready',
      issues,
    },
  }
}
