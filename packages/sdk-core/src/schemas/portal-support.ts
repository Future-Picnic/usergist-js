import { z } from 'zod'

export const supportStatusSchema = z.enum(['open', 'waiting_on_customer', 'closed'])
export const supportCursorSchema = z.string().max(500).optional()
export const supportPageQuerySchema = z.object({
  cursor: supportCursorSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()
export const supportTicketQuerySchema = supportPageQuerySchema.extend({ status: supportStatusSchema.optional() }).strict()
export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(3000),
  idempotencyKey: z.string().uuid(),
}).strict()
export const createSupportMessageSchema = z.object({
  body: z.string().trim().min(1).max(3000),
  idempotencyKey: z.string().uuid(),
}).strict()
export const updateSupportTicketSchema = z.object({
  status: supportStatusSchema,
  expectedVersion: z.number().int().min(1),
}).strict()
export const updateSupportSettingsSchema = z.object({
  enabled: z.boolean(),
  notificationUserId: z.string().uuid().nullable(),
}).strict()
