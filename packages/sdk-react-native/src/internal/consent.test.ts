import { expect, it, vi } from 'vitest'
import { createConsentManager } from './consent.js'
import type { StorageScope } from './storage.js'

it('persists withdrawal after an earlier slow opt-in without losing other consent categories', async () => {
  let complete!: () => void
  const writes: any[] = []
  const storage = {
    getJson: async () => null,
    setJson: vi.fn(async (_key: string, value: unknown) => {
      if (writes.length === 0) await new Promise<void>(resolve => { complete = resolve })
      writes.push(value)
    }),
  } as unknown as StorageScope
  const consent = createConsentManager(storage)
  const optIn = consent.set({ push: true, analytics: true })
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  const withdrawal = consent.set({ push: false, survey: true })
  await vi.waitFor(() => expect(consent.get().push).toBe(false))
  expect(storage.setJson).toHaveBeenCalledTimes(1)
  complete(); await optIn; await withdrawal
  expect(writes).toEqual([
    expect.objectContaining({ push: true, analytics: true, version: 1 }),
    expect.objectContaining({ push: false, analytics: true, survey: true, version: 2 }),
  ])
})
