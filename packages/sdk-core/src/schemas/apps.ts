import { z } from 'zod'
import { webAppConfigSchema } from './web.js'
import { emailSchema, slugSchema } from './primitives.js'
import { isValidIanaTimeZone } from '../timezone.js'
import { portalSlugSchema } from './portal.js'

export const workspaceTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidIanaTimeZone, 'Enter a valid IANA timezone')

export const platformSchema = z.enum([
  'ios',
  'android',
  'react-native',
  'expo',
  'flutter',
  'web',
])

export const writeKeyEnvironmentSchema = z.enum([
  'production',
  'staging',
  'development',
])

export const onboardingGoalSchema = z.enum([
  'feedback',
  'survey',
  'inapp',
  'push',
  'requests',
])
export const onboardingStatusSchema = z.enum([
  'in_progress',
  'deferred',
  'completed',
])
export const onboardingStepSchema = z.enum([
  'connect',
  'verify',
  'experience',
  'push',
  'launch',
])
export const onboardingPushChoiceSchema = z.enum([
  'pending',
  'configured',
  'skipped',
])

export const apiTokenScopeSchema = z.enum([
  'sdk:subjects',
  'push.transactional',
  'users.properties.write',
])

export const createAppSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  platforms: z.array(platformSchema).min(1).max(8),
  environment: writeKeyEnvironmentSchema.default('production'),
  onboardingGoal: onboardingGoalSchema.optional(),
  setupMode: z.enum(['sdk', 'portal']).optional(),
  portal: z
    .object({
      appSlug: portalSlugSchema,
      company: z
        .object({
          displayName: z.string().trim().min(1).max(100),
          slug: portalSlugSchema,
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional(),
  webConfig: webAppConfigSchema.optional(),
})

export const updateOnboardingSchema = z
  .object({
    action: z
      .enum([
        'resume',
        'defer',
        'create_first_feedback',
        'first_feedback_completed',
        'push_configured',
        'push_skipped',
        'complete',
      ])
      .optional(),
    step: onboardingStepSchema.optional(),
    question: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => Boolean(value.action || value.step), {
    message: 'Provide an onboarding action or step',
  })
  .refine(
    (value) =>
      value.action !== 'create_first_feedback' || Boolean(value.question),
    { message: 'Provide a question for the first feedback experience' },
  )

export const deferCurrentUserOnboardingSchema = z.object({
  action: z.literal('defer'),
})

export const updateAppSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    platforms: z.array(platformSchema).min(1).max(8).optional(),
    piiAllowList: z.array(z.string().min(1).max(120)).max(128).optional(),
    lifecycleEventsEnabled: z.boolean().optional(),
    webConfig: webAppConfigSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  })

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
  scopes: z
    .array(apiTokenScopeSchema)
    .min(1)
    .max(8)
    .transform((scopes) => [...new Set(scopes)]),
  expiresInDays: z.number().int().min(1).max(365).default(90),
})

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  timezone: workspaceTimezoneSchema.default('UTC'),
})

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timezone: workspaceTimezoneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'editor', 'viewer']),
})

export const acceptWorkspaceInviteSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid invitation token'),
})

export type CreateAppBody = z.infer<typeof createAppSchema>
export type UpdateOnboardingBody = z.infer<typeof updateOnboardingSchema>
export type UpdateAppBody = z.infer<typeof updateAppSchema>
export type CreateWriteKeyBody = z.infer<typeof createWriteKeySchema>
export type RotateWriteKeyBody = z.infer<typeof rotateWriteKeySchema>
export type CreateApiTokenBody = z.infer<typeof createApiTokenSchema>
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceSchema>
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceSchema>
export type InviteMemberBody = z.infer<typeof inviteMemberSchema>
export type AcceptWorkspaceInviteBody = z.infer<
  typeof acceptWorkspaceInviteSchema
>
