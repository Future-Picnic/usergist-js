import { z } from 'zod'
import { validPortalSlug } from '../types/portal.js'

export const portalSlugSchema = z.string().refine(validPortalSlug,
  'Use 3–48 lowercase letters, numbers, or interior hyphens. This name must not be reserved.')
export const updatePortalSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  slug: portalSlugSchema.optional(),
  setupDismissed: z.boolean().optional(),
}).strict()
export const updatePortalAppSchema = z.object({ slug: portalSlugSchema, enabled: z.boolean() }).strict()
export const portalVisibilitySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), visible: z.boolean() }).strict()
export const portalEmailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase())
export const portalAuthStartSchema = z.object({ email: portalEmailSchema }).strict()
export const portalAuthVerifySchema = z.object({ email: portalEmailSchema, code: z.string().regex(/^\d{6}$/) }).strict()
export const portalSubmissionSchema = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(1500),
  idempotencyKey: z.string().uuid(), feedbackConsent: z.literal(true),
}).strict()
export const portalVoteSchema = z.object({ vote: z.boolean(), feedbackConsent: z.literal(true) }).strict()
export const portalRequestQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['under_review', 'planned', 'in_progress', 'shipped', 'declined']).optional(),
  sort: z.enum(['top', 'newest', 'status_changed']).default('top'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()
