import { describe, it, expect } from 'vitest'
import { buildPortalUrl, suggestPortalSlug, validPortalSlug, resolvePortalColors, DEFAULT_PORTAL_COLORS } from './portal'
import { THEME_PRESETS } from './themes'
import { portalSubmissionSchema, portalAuthStartSchema, portalVoteSchema, portalPrivacyNoticeSchema } from '../schemas/portal'
describe('portal addresses and participant input boundaries', () => {
  it('requires a complete privacy notice and rejects executable, insecure or credential-bearing links', () => {
    const notice = { controllerName: ' Example Ltd ', policyUrl: 'https://example.test/privacy', contactEmail: ' Privacy@Example.test ' }
    expect(portalPrivacyNoticeSchema.parse(notice)).toEqual({ controllerName: 'Example Ltd', policyUrl: notice.policyUrl, contactEmail: 'privacy@example.test' })
    for (const policyUrl of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.test/privacy', 'https://user:secret@example.test/privacy', '//example.test/privacy']) {
      expect(portalPrivacyNoticeSchema.safeParse({ ...notice, policyUrl }).success).toBe(false)
    }
    expect(portalPrivacyNoticeSchema.safeParse({ policyUrl: notice.policyUrl }).success).toBe(false)
    expect(portalPrivacyNoticeSchema.safeParse({ ...notice, controllerName: '' }).success).toBe(false)
    expect(portalPrivacyNoticeSchema.safeParse({ ...notice, contactEmail: 'not-an-email' }).success).toBe(false)
    expect(portalPrivacyNoticeSchema.safeParse({ ...notice, trackingConsent: true }).success).toBe(false)
  })
  it('follows the complete app theme and ignores detached colors when reset', () => {
    const colors = THEME_PRESETS.find((preset) => preset.id === 'midnight')!.colors
    expect(resolvePortalColors('app_default', colors, DEFAULT_PORTAL_COLORS, '#FF0000')).toEqual(colors)
  })
  it('retains all custom colors independently of app defaults and supports old accent-only settings', () => {
    const colors = THEME_PRESETS.find((preset) => preset.id === 'ocean')!.colors
    expect(resolvePortalColors('custom', DEFAULT_PORTAL_COLORS, colors, '#FF0000')).toEqual({ ...colors, primary: '#FF0000' })
    expect(resolvePortalColors('custom', colors, null, '#123456')).toEqual({ ...DEFAULT_PORTAL_COLORS, primary: '#123456' })
  })
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
