import { describe, expect, it } from 'vitest'
import { updateCurrentUserSchema } from './auth.js'
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceTimezoneSchema,
} from './apps.js'

describe('workspace settings schemas', () => {
  it('trims workspace names and defaults newly created workspaces to UTC', () => {
    expect(createWorkspaceSchema.parse({ name: '  Acme  ' })).toEqual({
      name: 'Acme',
      timezone: 'UTC',
    })
    expect(updateWorkspaceSchema.parse({ name: '  New name  ' })).toEqual({
      name: 'New name',
    })
  })

  it('accepts valid IANA timezones and rejects invalid values', () => {
    expect(workspaceTimezoneSchema.parse(' Asia/Jerusalem ')).toBe(
      'Asia/Jerusalem',
    )
    expect(workspaceTimezoneSchema.safeParse('Mars/Olympus_Mons').success).toBe(false)
  })

  it('rejects empty, unknown, and invalid workspace patches', () => {
    expect(updateWorkspaceSchema.safeParse({}).success).toBe(false)
    expect(updateWorkspaceSchema.safeParse({ slug: 'renamed' }).success).toBe(false)
    expect(updateWorkspaceSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(updateWorkspaceSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false)
  })
})

describe('account settings schema', () => {
  it('trims the current user display name', () => {
    expect(updateCurrentUserSchema.parse({ name: '  Ada Lovelace  ' })).toEqual({
      name: 'Ada Lovelace',
    })
  })

  it('cannot target another user or modify authentication identity', () => {
    expect(updateCurrentUserSchema.safeParse({}).success).toBe(false)
    expect(
      updateCurrentUserSchema.safeParse({ userId: 'other-user', name: 'Ada' }).success,
    ).toBe(false)
    expect(
      updateCurrentUserSchema.safeParse({
        name: 'Ada',
        email: 'other@example.com',
      }).success,
    ).toBe(false)
    expect(updateCurrentUserSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
})
