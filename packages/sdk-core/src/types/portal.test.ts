import { describe, it, expect } from 'vitest'
import { buildPortalUrl, suggestPortalSlug, validPortalSlug } from './portal'
import { portalSubmissionSchema, portalAuthStartSchema, portalVoteSchema } from '../schemas/portal'
describe('portal addresses and participant input boundaries', () => {
  it('validates and resolves company and app addresses on the owned domain', () => {
    expect(buildPortalUrl('acme-team', undefined, 'notes')).toBe('https://acme-team.usergist.com/notes/requests')
    expect(suggestPortalSlug('Acme & Team')).toBe('acme-team')
    for (const slug of ['ab', '-abc', 'abc-', 'Upper', 'api', 'support', 'a.b', 'a'.repeat(49)]) expect(validPortalSlug(slug)).toBe(false)
    for (const slug of ['abc', '123', 'my-team', 'a'.repeat(48)]) expect(validPortalSlug(slug)).toBe(true)
  })
  it('normalizes mailbox identity while refusing trusted identity and publication fields', () => {
    expect(portalAuthStartSchema.parse({ email: ' Visitor@Example.com ' }).email).toBe('visitor@example.com')
    const body = { title: 'My idea', description: 'Details', idempotencyKey: '00000000-0000-4000-8000-000000000001', feedbackConsent: true }
    expect(portalSubmissionSchema.safeParse(body).success).toBe(true)
    for (const extra of [{ appId: 'forged' }, { externalId: 'sdk-user' }, { portalVisible: true }, { feedbackConsent: false }, { title: 'a'.repeat(121) }, { description: 'a'.repeat(1501) }]) expect(portalSubmissionSchema.safeParse({ ...body, ...extra }).success).toBe(false)
    expect(portalVoteSchema.safeParse({ vote: true, feedbackConsent: true, anonymousId: 'forged' }).success).toBe(false)
  })
})
