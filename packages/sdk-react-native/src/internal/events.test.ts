import { PresentationGate } from '@usergist/sdk-core/mobile'
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

it('buffers campaign UI across provider mounting while analytics callbacks remain available', () => {
  const gate = new PresentationGate(true)
  const bus = createEventBus(gate)
  const invite = vi.fn(), analytics = vi.fn()
  bus.emit('surveyInvite', { surveyId: 'welcome', name: 'Welcome', source: 'event' })
  bus.on('surveyInvite', invite)
  bus.on('pushEvent', analytics)
  bus.emit('pushEvent', { name: 'received', props: {} })
  expect(analytics).toHaveBeenCalledOnce()
  expect(invite).not.toHaveBeenCalled()
  gate.setPaused(false)
  gate.setPaused(false)
  expect(invite).toHaveBeenCalledOnce()
})

it('cannot revive buffered campaign UI after revocation or a user change', () => {
  const gate = new PresentationGate(true)
  const bus = createEventBus(gate)
  const invite = vi.fn()
  bus.on('surveyInvite', invite)
  bus.emit('surveyInvite', { surveyId: 'old-consent', name: 'Old', source: 'event' })
  gate.invalidate('survey')
  bus.emit('surveyInvite', { surveyId: 'old-user', name: 'Old', source: 'event' })
  gate.invalidate()
  bus.emit('surveyInvite', { surveyId: 'new-user', name: 'New', source: 'event' })
  gate.setPaused(false)
  expect(invite).toHaveBeenCalledOnce()
  expect(invite).toHaveBeenCalledWith(expect.objectContaining({ surveyId: 'new-user' }))
})
