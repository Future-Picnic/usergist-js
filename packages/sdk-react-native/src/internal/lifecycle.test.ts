import {afterEach, expect, it, vi} from 'vitest'
import {createLifecycleManager} from './lifecycle.js'

afterEach(() => vi.useRealTimers())

it('polls due instructions without waiting for a full rule refresh and stops with the lifecycle', () => {
  vi.useFakeTimers()
  const poll = vi.fn(), refresh = vi.fn()
  const lifecycle = createLifecycleManager({
    onForeground: vi.fn(), onBackground: vi.fn(), onSyncTick: refresh,
    onInstructionPoll: poll, syncIntervalMs: 300_000,
  })
  lifecycle.start()
  vi.advanceTimersByTime(15_000)
  expect(poll).toHaveBeenCalledTimes(3)
  expect(refresh).not.toHaveBeenCalled()
  lifecycle.stop()
  vi.advanceTimersByTime(300_000)
  expect(poll).toHaveBeenCalledTimes(3)
  expect(refresh).not.toHaveBeenCalled()
})
