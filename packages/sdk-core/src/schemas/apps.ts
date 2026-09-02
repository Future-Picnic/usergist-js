import { z } from 'zod'
import { emailSchema, slugSchema } from './primitives.js'

export const platformSchema = z.enum(['ios', 'android', 'react-native', 'flutter'])

export const writeKeyEnvironmentSchema = z.enum(['production', 'staging', 'development'])

export const apiTokenScopeSchema = z.enum(['sdk:subjects', 'push.transactional'])

export const createAppSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  platforms: z.array(platformSchema).min(1).max(8),
  environment: writeKeyEnvironmentSchema.default('production'),
})

export const updateAppSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    platforms: z.array(platformSchema).min(1).max(8).optional(),
    piiAllowList: z.array(z.string().min(1).max(120)).max(128).optional(),
    lifecycleEventsEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const createWriteKeySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  environment: writeKeyEnvironmentSchema.default('production'),
})

export const rotateWriteKeySchema = z.object({
  // Default 5 minutes; ceiling 24h to bound risk of forgotten old keys.
  graceSeconds: z.number().int().min(0).max(86_400).default(300),
})

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiTokenScopeSchema).min(1).max(8).transform((scopes) => [...new Set(scopes)]),
  expiresInDays: z.number().int().min(1).max(365).default(90),
})

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
})

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'editor', 'viewer']),
})

export const acceptWorkspaceInviteSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid invitation token'),
})

export type CreateAppBody = z.infer<typeof createAppSchema>
export type UpdateAppBody = z.infer<typeof updateAppSchema>
export type CreateWriteKeyBody = z.infer<typeof createWriteKeySchema>
export type RotateWriteKeyBody = z.infer<typeof rotateWriteKeySchema>
export type CreateApiTokenBody = z.infer<typeof createApiTokenSchema>
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceSchema>
export type InviteMemberBody = z.infer<typeof inviteMemberSchema>
export type AcceptWorkspaceInviteBody = z.infer<typeof acceptWorkspaceInviteSchema>
