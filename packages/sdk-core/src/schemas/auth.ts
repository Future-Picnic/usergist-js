import { z } from 'zod'
import { emailSchema } from './primitives.js'

/**
 * Password policy. Tightening this here flows to: API signup route, dashboard
 * SignupForm, password-reset flow, future SSO bridge. Don't fork it in a form.
 */
export const passwordSchema = z.string().min(8).max(256)

export const signupRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120).optional(),
  workspaceName: z.string().min(1).max(120),
})

export const loginPasswordRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
})

export const loginMagicLinkRequestSchema = z.object({
  email: emailSchema,
})

export const loginMagicLinkConsumeRequestSchema = z.object({
  token: z.string().min(16).max(512),
})

export type SignupBody = z.infer<typeof signupRequestSchema>
export type LoginPasswordBody = z.infer<typeof loginPasswordRequestSchema>
export type LoginMagicLinkBody = z.infer<typeof loginMagicLinkRequestSchema>
export type LoginMagicLinkConsumeBody = z.infer<typeof loginMagicLinkConsumeRequestSchema>
