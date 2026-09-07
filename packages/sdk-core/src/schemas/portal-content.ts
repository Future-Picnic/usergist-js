import { z } from 'zod'
import { contentText, safeContentHref, type ContentNode } from '../types/portal-content.js'

const uuid = z.string().uuid()
export const contentKindSchema = z.enum(['article', 'changelog'])
export const contentStateSchema = z.enum(['draft', 'published', 'archived'])
export const roadmapStatusSchema = z.enum(['planned', 'in_progress', 'shipped'])
export const contentLinkSchema = z.object({ kind: z.enum(['request', 'roadmap']), id: uuid }).strict()
const mark = z
  .object({
    type: z.enum(['bold', 'italic', 'code', 'link']),
    attrs: z
      .object({ href: z.string().max(2048).refine(safeContentHref, 'Use a safe link URL') })
      .strict()
      .optional(),
  })
  .strict()
  .refine((m) => (m.type === 'link' ? Boolean(m.attrs) : !m.attrs))
const node: z.ZodType<ContentNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'doc',
        'paragraph',
        'heading',
        'text',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'codeBlock',
        'hardBreak',
        'image',
      ]),
      text: z.string().max(100000).optional(),
      attrs: z
        .object({
          level: z.number().int().min(2).max(3).optional(),
          start: z.number().int().min(1).max(10000).optional(),
          language: z.string().max(40).nullable().optional(),
          assetId: uuid.optional(),
          alt: z.string().max(500).optional(),
        })
        .strict()
        .optional(),
      marks: z.array(mark).max(4).optional(),
      content: z.array(node).max(5000).optional(),
    })
    .strict(),
)
export const contentBodySchema = z
  .unknown()
  .superRefine((value, ctx) => {
    let count = 0,
      invalid = false
    const walk = (v: unknown, depth: number) => {
      if (depth > 20 || ++count > 5000) {
        invalid = true
        return
      }
      if (v && typeof v === 'object' && 'content' in v && Array.isArray(v.content))
        for (const child of v.content) {
          if (invalid) break
          walk(child, depth + 1)
        }
    }
    walk(value, 0)
    if (invalid)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Document is too deeply nested or contains too many blocks',
      })
  })
  .pipe(node)
  .superRefine((value, ctx) => {
    if (value.type !== 'doc' || contentText(value).length > 100000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid document or body exceeds 100,000 characters',
      })
    const walk = (v: ContentNode, root = false) => {
      const blocks = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'image']
      const children = v.content ?? []
      const allowed =
        v.type === 'doc' || v.type === 'blockquote'
          ? blocks
          : v.type === 'listItem'
          ? blocks.filter((t) => t !== 'heading')
          : v.type === 'bulletList' || v.type === 'orderedList'
          ? ['listItem']
          : v.type === 'paragraph' || v.type === 'heading'
          ? ['text', 'hardBreak']
          : v.type === 'codeBlock'
          ? ['text']
          : []
      const attrs = Object.keys(v.attrs ?? {})
      const allowedAttrs =
        v.type === 'heading'
          ? ['level']
          : v.type === 'orderedList'
          ? ['start']
          : v.type === 'codeBlock'
          ? ['language']
          : v.type === 'image'
          ? ['assetId', 'alt']
          : []
      if (
        (!root && v.type === 'doc') ||
        (v.type === 'text' && (!v.text || v.content)) ||
        (v.type !== 'text' && (v.text !== undefined || Boolean(v.marks?.length))) ||
        (v.type === 'image' && (!v.attrs?.assetId || v.content)) ||
        (v.type === 'heading' && !v.attrs?.level) ||
        attrs.some((a) => !allowedAttrs.includes(a)) ||
        children.some((c) => !allowed.includes(c.type)) ||
        (v.type === 'listItem' && children[0]?.type !== 'paragraph') ||
        (['bulletList', 'orderedList', 'blockquote', 'doc'].includes(v.type) && !children.length) ||
        (v.type === 'codeBlock' && children.some((c) => c.marks?.length))
      )
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid content block' })
      v.content?.forEach((c) => walk(c))
    }
    walk(value, true)
  })
export const documentDraftSchema = z
  .object({
    title: z.string().trim().max(160),
    summary: z.string().max(280),
    body: contentBodySchema,
    collectionId: uuid.nullable(),
    category: z.enum(['new', 'improved', 'fixed']),
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
        'Choose a valid date',
      ),
    version: z.string().max(40),
    links: z.array(contentLinkSchema).max(100),
  })
  .strict()
export const createDocumentSchema = z
  .object({
    idempotencyKey: uuid,
    title: z.string().trim().max(160).optional(),
    collectionId: uuid.nullable().optional(),
    links: z.array(contentLinkSchema).max(100).optional(),
  })
  .strict()
export const saveDocumentSchema = z
  .object({ revision: z.number().int().positive(), draft: documentDraftSchema })
  .strict()
export const contentActionSchema = z
  .object({
    revision: z.number().int().positive(),
    action: z.enum(['publish', 'unpublish', 'archive', 'restore']),
  })
  .strict()
export const contentQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    state: contentStateSchema.optional(),
    collectionId: uuid.optional(),
    category: z.enum(['new', 'improved', 'fixed']).optional(),
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
export const createCollectionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(280),
    idempotencyKey: uuid,
  })
  .strict()
export const contentPageQuerySchema = contentQuerySchema.pick({ cursor: true, limit: true })
export const portalAssetUploadKeySchema = uuid
export const updateCollectionSchema = z
  .object({
    revision: z.number().int().positive(),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(280).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
export const reorderContentSchema = z
  .object({ revision: z.number().int().positive(), direction: z.enum(['up', 'down']) })
  .strict()
export const roadmapQuerySchema = z
  .object({
    status: roadmapStatusSchema,
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    archived: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict()
const roadmapFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1500),
  requestIds: z
    .array(uuid)
    .max(100)
    .refine((v) => new Set(v).size === v.length),
}
export const createRoadmapSchema = z
  .object({ ...roadmapFields, idempotencyKey: uuid, status: roadmapStatusSchema })
  .strict()
export const saveRoadmapSchema = z
  .object({ ...roadmapFields, revision: z.number().int().positive() })
  .strict()
export const moveRoadmapSchema = z
  .object({
    revision: z.number().int().positive(),
    status: roadmapStatusSchema,
    requests: z
      .array(z.object({ id: uuid, updatedAt: z.string().datetime() }).strict())
      .max(100)
      .refine((v) => new Set(v.map((r) => r.id)).size === v.length),
  })
  .strict()

export const contentLinkQuerySchema = z
  .object({
    kind: z.enum(['request', 'roadmap']),
    q: z.string().trim().max(200).optional(),
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    ids: z
      .string()
      .max(4000)
      .optional()
      .refine((v) => !v || v.split(',').every((id) => uuid.safeParse(id).success), 'Invalid linked IDs'),
  })
  .strict()
