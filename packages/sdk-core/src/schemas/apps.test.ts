import { describe, expect, it } from 'vitest'
import { createApiTokenSchema, createAppSchema } from './apps.js'

describe('SDK administration schemas', () => {
  it('defaults a new app to a production write key', () => {
    const parsed = createAppSchema.parse({
      name: 'Acme Mobile',
      platforms: ['ios', 'android'],
    })
    expect(parsed.environment).toBe('production')
  })

  it('issues least-privilege server keys with a bounded lifetime', () => {
    const parsed = createApiTokenSchema.parse({
      name: 'Production identity exchange',
      scopes: ['sdk:subjects', 'sdk:subjects'],
    })
    expect(parsed.scopes).toEqual(['sdk:subjects'])
    expect(parsed.expiresInDays).toBe(90)
  })

  it('rejects unknown scopes and unbounded expiry', () => {
    expect(() => createApiTokenSchema.parse({
      name: 'Too powerful',
      scopes: ['*'],
    })).toThrow()
    expect(() => createApiTokenSchema.parse({
      name: 'Never expires',
      scopes: ['sdk:subjects'],
      expiresInDays: 366,
    })).toThrow()
  })

  it('supports a narrowly scoped transactional-push server key', () => {
    const parsed = createApiTokenSchema.parse({
      name: 'Order updates',
      scopes: ['push.transactional'],
      expiresInDays: 30,
    })
    expect(parsed.scopes).toEqual(['push.transactional'])
  })
})
