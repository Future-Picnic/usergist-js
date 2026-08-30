import { describe, expect, it } from 'vitest'
import {
  CORE_INTEGRATION_EVENTS,
  INTEGRATION_CATEGORIES,
  USER_IDENTIFIED_EVENT_NAME,
  getCoreIntegrationEvent,
  sanitizeCoreIntegrationProperties,
} from './integration.js'

describe('outbound integration event catalog', () => {
  it('has unique stable keys and readable UserGist names', () => {
    const keys = CORE_INTEGRATION_EVENTS.map((event) => event.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const event of CORE_INTEGRATION_EVENTS) {
      expect(event.name).toMatch(/^UserGist /)
    }
  })

  it('covers every selectable category and locks the identity event', () => {
    const catalogCategories = new Set(CORE_INTEGRATION_EVENTS.map((event) => event.category))
    for (const category of INTEGRATION_CATEGORIES) expect(catalogCategories.has(category)).toBe(true)
    expect(getCoreIntegrationEvent(USER_IDENTIFIED_EVENT_NAME)).toMatchObject({
      name: 'UserGist User Identified',
      category: 'identity',
      required: true,
    })
  })

  it('exports only explicitly allowlisted safe properties', () => {
    const survey = getCoreIntegrationEvent('$survey_completed')!
    expect(sanitizeCoreIntegrationProperties(survey, {
      campaignId: 'campaign-1',
      attempt_id: 'attempt-1',
      language: 'en',
      durationMs: 4200,
      answers: { q1: 'private answer' },
      feedback_text: 'private feedback',
      arbitrary_custom_property: 'must not leave UserGist',
    })).toEqual({
      campaign_id: 'campaign-1',
      attempt_id: 'attempt-1',
      language: 'en',
      duration_ms: 4200,
    })
  })

  it('drops objects and arrays even when supplied under an allowlisted key', () => {
    const request = getCoreIntegrationEvent('$request_status_changed')!
    expect(sanitizeCoreIntegrationProperties(request, {
      request_id: ['not', 'an', 'id'],
      old_status: { value: 'planned' },
      new_status: 'shipped',
    })).toEqual({ new_status: 'shipped' })
  })

  it('normalizes the SDK push action button into the provider action ID', () => {
    const push = getCoreIntegrationEvent('$push_action_clicked')!
    expect(sanitizeCoreIntegrationProperties(push, {
      delivery_id: 'delivery-1',
      action_button: 'reply',
      notification_body: 'private notification content',
    })).toEqual({ delivery_id: 'delivery-1', action_id: 'reply' })
  })
})
