import { describe, expect, it } from 'vitest'
import { createSupportMessageSchema, createSupportTicketSchema, updateSupportSettingsSchema } from './portal-support.js'

describe('portal support contracts', () => {
  it('trims bounded plain text and requires UUID idempotency keys', () => {
    const idempotencyKey = crypto.randomUUID()
    expect(createSupportTicketSchema.parse({ subject: '  Help  ', body: '  Private body  ', idempotencyKey }))
      .toEqual({ subject: 'Help', body: 'Private body', idempotencyKey })
    expect(createSupportTicketSchema.safeParse({ subject: '', body: 'x', idempotencyKey }).success).toBe(false)
    expect(createSupportTicketSchema.safeParse({ subject: 'x'.repeat(151), body: 'x', idempotencyKey }).success).toBe(false)
    expect(createSupportMessageSchema.safeParse({ body: 'x'.repeat(3001), idempotencyKey }).success).toBe(false)
    expect(createSupportMessageSchema.safeParse({ body: 'ok', idempotencyKey: 'retry-me' }).success).toBe(false)
  })

  it('keeps enablement and recipient selection explicit', () => {
    const notificationUserId = crypto.randomUUID()
    expect(updateSupportSettingsSchema.parse({ enabled: true, notificationUserId })).toEqual({ enabled: true, notificationUserId })
    expect(updateSupportSettingsSchema.parse({ enabled: false, notificationUserId: null })).toEqual({ enabled: false, notificationUserId: null })
  })
})
