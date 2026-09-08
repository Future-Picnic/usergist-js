import { describe, expect, it } from 'vitest'
import { createApiTokenSchema, createAppSchema, updateOnboardingSchema } from './apps.js'
import { deliveryPlatformsForApp } from '../types/web.js'

describe('SDK administration schemas', () => {
  it('accepts Expo as an integration and expands campaigns to native delivery platforms', () => {
    const app = createAppSchema.parse({ name: 'Expo app', platforms: ['expo'] })
    expect(app.platforms).toEqual(['expo'])
    expect(deliveryPlatformsForApp(app.platforms)).toEqual(['ios', 'android'])
    expect(deliveryPlatformsForApp(['expo', 'ios', 'react-native', 'web'])).toEqual(['ios', 'android', 'web'])
  })
  it('defaults a new app to a production write key', () => {
    const parsed = createAppSchema.parse({
      name: 'Acme Mobile',
      platforms: ['ios', 'android'],
    })
    expect(parsed.environment).toBe('production')
  })

  it('accepts an onboarding goal without requiring it for existing clients', () => {
    expect(createAppSchema.parse({
      name: 'Acme Mobile',
      platforms: ['react-native'],
      onboardingGoal: 'feedback',
    }).onboardingGoal).toBe('feedback')
    expect(createAppSchema.parse({ name: 'Legacy client', platforms: ['ios'] }).onboardingGoal).toBeUndefined()
  })

  it('requires a meaningful onboarding update', () => {
    expect(updateOnboardingSchema.parse({ step: 'verify' })).toEqual({ step: 'verify' })
    expect(updateOnboardingSchema.parse({ step: 'experience' })).toEqual({ step: 'experience' })
    expect(updateOnboardingSchema.parse({ action: 'push_skipped' })).toEqual({ action: 'push_skipped' })
    expect(updateOnboardingSchema.parse({
      action: 'create_first_feedback',
      question: 'How is your experience so far?',
    })).toEqual({
      action: 'create_first_feedback',
      question: 'How is your experience so far?',
    })
    expect(() => updateOnboardingSchema.parse({ action: 'create_first_feedback' })).toThrow()
    expect(() => updateOnboardingSchema.parse({})).toThrow()
  })

  it('accepts a draft portal during app creation and rejects unsafe public addresses', () => {
    const input = { name: 'Choro', platforms: ['web'], portal: { appSlug: 'choro', company: { displayName: 'Ritmus', slug: 'ritmus' } } }
    expect(createAppSchema.parse(input).portal).toEqual(input.portal)
    expect(createAppSchema.parse({ ...input, portal: { appSlug: 'choro' } }).portal).toEqual({ appSlug: 'choro' })
    for (const slug of ['api', 'ab', '-company', 'company/other', 'company.example.com']) {
      expect(createAppSchema.safeParse({ ...input, portal: { ...input.portal, appSlug: slug } }).success).toBe(false)
      expect(createAppSchema.safeParse({ ...input, portal: { ...input.portal, company: { displayName: 'Ritmus', slug } } }).success).toBe(false)
    }
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
