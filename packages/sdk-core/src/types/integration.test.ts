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

  it('exports normalized structured answer details under readable property names', () => {
    const answer = getCoreIntegrationEvent('$survey_answer_submitted')!
    expect(sanitizeCoreIntegrationProperties(answer, {
      campaign_id: 'campaign-1',
      survey_name: 'Activation survey',
      question_id: 'rating',
      question_type: 'rating',
      question_title: 'How useful was onboarding?',
      answer_format: 'number',
      answer_present: true,
      answer_value: 'raw value stays internal',
      answer_display_value: 'raw display stays internal',
      answer_numeric_value: 5,
      __usergist_destination_answer_value: 5,
      __usergist_destination_answer_display_value: '5 — Very useful',
    })).toEqual({
      campaign_id: 'campaign-1',
      survey_name: 'Activation survey',
      question_id: 'rating',
      question_type: 'rating',
      question_title: 'How useful was onboarding?',
      answer_format: 'number',
      answer_present: true,
      answer_numeric_value: 5,
      answer_value: 5,
      answer_display_value: '5 — Very useful',
    })
  })

  it('does not export raw free-text answers', () => {
    const answer = getCoreIntegrationEvent('$feedback_answer_submitted')!
    expect(sanitizeCoreIntegrationProperties(answer, {
      prompt_id: 'prompt-1',
      question_id: 'comment',
      question_type: 'short_text',
      question_title: 'Tell us more',
      answer_format: 'text',
      answer_present: true,
      answer_value: 'private free text',
      answer_display_value: 'private free text',
      answer_text_length: 17,
    })).toEqual({
      prompt_id: 'prompt-1',
      question_id: 'comment',
      question_type: 'short_text',
      question_title: 'Tell us more',
      answer_format: 'text',
      answer_present: true,
      answer_text_length: 17,
    })
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
