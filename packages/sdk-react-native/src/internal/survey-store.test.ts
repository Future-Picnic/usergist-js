import { beforeEach, expect, it } from 'vitest'
import { configureStorageAdapter } from './storage.js'
import { createSurveyStore, type PendingAttempt } from './survey-store.js'
const data = new Map<string, string>()
let failWrites = false
beforeEach(() => {
  data.clear()
  failWrites = false
  configureStorageAdapter({
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      if (failWrites) throw Error('disk full')
      data.set(key, value)
    },
    removeItem: async (key) => {
      data.delete(key)
    },
  })
})
const attempt = {
  anonymousId: 'alias',
  externalId: 'alice',
  surveyId: 'survey',
  attemptId: 'attempt',
  startedAt: Date.now(),
  currentQuestionId: 'q1',
  snapshot: {},
  language: null,
} satisfies PendingAttempt

it('serializes concurrent progress and recovers the latest answer after relaunch', async () => {
  const store = createSurveyStore('key')
  await store.upsert(attempt)
  await Promise.all([
    store.updateProgress('attempt', 'q2', { q1: 'one' }),
    store.updateProgress('attempt', 'q3', { q1: 'one', q2: 'two' }),
  ])
  expect(
    await createSurveyStore('key').findForSurvey('survey')
  ).toMatchObject({
    currentQuestionId: 'q3',
    snapshot: { q1: 'one', q2: 'two' },
  })
})
it('does not surface another account or unbound legacy attempts', async () => {
  const identity = {
    anonymousId: 'alias',
    externalId: 'alice' as string | null,
  }
  const store = createSurveyStore('key', () => identity)
  await store.upsert(attempt)
  expect(await store.list()).toHaveLength(1)
  identity.externalId = 'bob'
  expect(await store.list()).toEqual([])
  identity.externalId = null
  expect(await store.list()).toEqual([])
  identity.externalId = 'alice'
  identity.anonymousId = 'new-alias'
  expect(await store.list()).toEqual([])
})
it('reports persistence failure instead of claiming answers are saved', async () => {
  const store = createSurveyStore('key')
  await store.upsert(attempt)
  failWrites = true
  await expect(
    store.updateProgress('attempt', 'q2', { q1: 'answer' })
  ).rejects.toThrow('disk full')
  failWrites = false
  expect((await store.list())[0]?.snapshot).toEqual({})
})
it('clear waits for outstanding writes and cannot resurrect a reset attempt', async () => {
  const store = createSurveyStore('key')
  await store.upsert(attempt)
  await Promise.all([
    store.updateProgress('attempt', 'q2', { q1: 'old user' }),
    store.clear(),
  ])
  expect(await createSurveyStore('key').list()).toEqual([])
})
