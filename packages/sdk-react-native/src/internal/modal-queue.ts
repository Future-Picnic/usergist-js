export type ModalTask = (release: () => void) => void

export interface ModalQueue {
  readonly enqueue: (task: ModalTask) => void
  readonly clearPending: () => void
  readonly pendingCount: () => number
}

/** FIFO for prompt, survey, and in-app presentations. */
export function createModalQueue(): ModalQueue {
  const pending: ModalTask[] = []
  let active = false

  function drain(): void {
    if (active) return
    const task = pending.shift()
    if (!task) return
    active = true
    let released = false
    task(() => {
      if (released) return
      released = true
      active = false
      drain()
    })
  }

  return {
    enqueue(task): void {
      pending.push(task)
      drain()
    },
    clearPending(): void {
      pending.length = 0
    },
    pendingCount: () => pending.length,
  }
}
