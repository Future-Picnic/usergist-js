import { z } from 'zod'

/** Lowercase + digits + dashes; URL-safe slug. */
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Must be lowercase, digits, and dashes only')

/** RFC 5321 max email length. */
export const emailSchema = z.string().email().max(320)

export const uuidSchema = z.string().uuid()

export const isoDateTimeSchema = z.string().datetime({ offset: true })

/** Workspace role hierarchy used by tenant middleware. */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer'])

export type WorkspaceRoleInput = z.infer<typeof workspaceRoleSchema>
