import { describe, expect, it } from 'vitest'
import { createModalQueue } from './modal-queue.js'

describe('campaign modal queue', () => {
  it('runs FIFO and makes each release idempotent', () => {
    const queue = createModalQueue()
    const started: string[] = []
    const releases: Array<() => void> = []

    for (const label of ['prompt', 'survey', 'inapp']) {
      queue.enqueue((release) => {
        started.push(label)
        releases.push(release)
      })
    }

    expect(started).toEqual(['prompt'])
    expect(queue.pendingCount()).toBe(2)
    releases[0]?.()
    releases[0]?.()
    expect(started).toEqual(['prompt', 'survey'])
    releases[1]?.()
    expect(started).toEqual(['prompt', 'survey', 'inapp'])
  })

  it('can drop pending work without interrupting the active modal', () => {
    const queue = createModalQueue()
    const started: string[] = []
    let releaseActive: (() => void) | undefined
    queue.enqueue((release) => {
      started.push('active')
      releaseActive = release
    })
    queue.enqueue(() => started.push('pending'))

    queue.clearPending()
    releaseActive?.()

    expect(started).toEqual(['active'])
  })
})
