import { describe, expect, it, vi } from 'vitest'
import { createLocalInstructionDedupe } from './instruction-dedupe.js'
import type { StorageScope } from './storage.js'

function storageWith(initial: ReadonlyArray<string> | null = null): {
  storage: StorageScope
  setJson: ReturnType<typeof vi.fn>
} {
  const setJson = vi.fn(async () => undefined)
  return {
    storage: {
      key: (suffix) => suffix,
      getJson: vi.fn(async () => initial),
      setJson,
      setJsonStrict: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      clearAll: vi.fn(async () => undefined),
    },
    setJson,
  }
}

describe('local instruction dedupe', () => {
  it('survives restart and consumes the matching server instruction once', async () => {
    const { storage, setJson } = storageWith(['inapp.show:message-1:event:event-1'])
    const dedupe = createLocalInstructionDedupe(storage)

    await dedupe.hydrate()

    expect(dedupe.consume('inapp.show:message-1:event:event-1')).toBe(true)
    expect(dedupe.consume('inapp.show:message-1:event:event-1')).toBe(false)
    await vi.waitFor(() =>
      expect(setJson).toHaveBeenLastCalledWith('localInstructionDedupe', []),
    )
  })

  it('keeps only the latest 200 locally rendered instructions', async () => {
    const { storage, setJson } = storageWith()
    const dedupe = createLocalInstructionDedupe(storage)

    for (let index = 0; index < 205; index += 1) {
      dedupe.remember(`inapp.show:message:event:${index}`)
    }

    expect(dedupe.size()).toBe(200)
    expect(dedupe.has('inapp.show:message:event:0')).toBe(false)
    expect(dedupe.has('inapp.show:message:event:204')).toBe(true)
    await vi.waitFor(() => expect(setJson).toHaveBeenCalledTimes(205))
  })
})
