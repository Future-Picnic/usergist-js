import { expect, it, vi } from 'vitest'
import { createEventBus } from './events.js'

it('does not replay a previous account request screen when the provider mounts after logout', () => {
  const bus = createEventBus()
  bus.emit('showRequestDetail', { requestId: 'old-account' })
  bus.emit('resetSurfaces', undefined)
  const show = vi.fn()
  bus.on('showRequestDetail', show)
  expect(show).not.toHaveBeenCalled()
  bus.emit('showRequestDetail', { requestId: 'new-account' })
  expect(show).toHaveBeenCalledWith({ requestId: 'new-account' })
})

it('withdrawing request consent clears buffered request screens while retaining survey invitations', () => {
  const bus = createEventBus()
  bus.emit('showRequestsBoard', undefined)
  bus.emit('surveyInvite', { surveyId: 'survey', name: 'Survey', source: 'event' })
  bus.emit('dismissRequests', undefined)
  const board = vi.fn(); const survey = vi.fn()
  bus.on('showRequestsBoard', board); bus.on('surveyInvite', survey)
  expect(board).not.toHaveBeenCalled()
  expect(survey).toHaveBeenCalledOnce()
})
