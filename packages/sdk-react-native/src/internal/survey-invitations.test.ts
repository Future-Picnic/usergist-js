import { afterEach, expect, it, vi } from 'vitest'
import {
  createSurveyInvitations,
  type SurveyInvitation,
} from './survey-invitations.js'
import type { StorageScope } from './storage.js'

afterEach(() => vi.useRealTimers())

it('isolates pending invitations by identity, expires them and clears them on reset', async () => {
  vi.useFakeTimers()
  let value: unknown = null
  let identity = { anonymousId: 'alias', externalId: null as string | null }
  const storage = {
    getJson: async () => structuredClone(value),
    setJsonStrict: async (_key: string, next: unknown) => {
      value = structuredClone(next)
    },
  } as StorageScope
  const store = createSurveyInvitations(storage, () => identity)
  const offer = {
    surveyId: 'survey',
    presentationId: 'first',
    source: 'triggered',
    survey: { id: 'survey' },
    expiresAt: Date.now() + 1000,
  } as SurveyInvitation
  await store.remember(offer)
  identity = { ...identity, externalId: 'alice' }
  expect(await store.find('survey')).toBeUndefined()
  await store.remember({ ...offer, presentationId: 'alice-first' })
  await store.remember({ ...offer, presentationId: 'alice-second' })
  await store.remove('alice-first')
  expect((await store.find('survey'))?.presentationId).toBe('alice-second')
  identity = { ...identity, externalId: 'bob' }
  expect(await store.find('survey')).toBeUndefined()
  identity = { anonymousId: 'new-alias', externalId: 'alice' }
  expect(await store.find('survey')).toBeUndefined()
  identity = { anonymousId: 'alias', externalId: 'alice' }
  vi.advanceTimersByTime(1001)
  expect(await store.find('survey')).toBeUndefined()
  const pending = store.remember({ ...offer, expiresAt: Date.now() + 1000 })
  const reset = store.clear()
  await Promise.all([pending, reset])
  expect(await store.find('survey')).toBeUndefined()
})

it('never extends the authorization lifetime when the same invitation is retried', async () => {
  vi.useFakeTimers()
  let value: unknown = null
  const storage = {
    getJson: async () => structuredClone(value),
    setJsonStrict: async (_key: string, next: unknown) => {
      value = structuredClone(next)
    },
  } as StorageScope
  const store = createSurveyInvitations(storage, () => ({
    anonymousId: 'alias',
    externalId: null,
  }))
  const offer = {
    surveyId: 'survey',
    presentationId: 'presentation',
    source: 'triggered',
    survey: { id: 'survey' },
    expiresAt: Date.now() + 1000,
  } as SurveyInvitation
  await store.remember(offer)
  await store.remember({ ...offer, expiresAt: Date.now() + 5000 })
  vi.advanceTimersByTime(1001)
  expect(await store.find('survey')).toBeUndefined()
})
