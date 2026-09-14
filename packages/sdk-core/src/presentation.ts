/** Runtime-only readiness state. Pausing never stops analytics or dismisses active UI. */
export class PresentationGate {
  private paused: boolean
  private identity = 0
  private revisions = { feedback: 0, survey: 0 }
  private readonly listeners = new Set<() => void>()

  constructor(paused = false) { this.paused = paused }
  get isPaused(): boolean { return this.paused }
  setPaused(paused: boolean): void {
    this.paused = paused
    this.notify()
  }
  invalidate(purpose?: 'feedback' | 'survey'): void {
    if (purpose) this.revisions[purpose]++
    else this.identity++
    this.notify()
  }
  validator(purpose: 'feedback' | 'survey'): () => boolean {
    const identity = this.identity
    const revision = this.revisions[purpose]
    return () => identity === this.identity && revision === this.revisions[purpose]
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  runWhenReady(run: () => void, valid: () => boolean, cancel: () => void = () => {}): void {
    if (!valid()) { cancel(); return }
    if (!this.paused) { run(); return }
    const stop = this.subscribe(() => {
      if (valid() && this.paused) return
      stop()
      if (valid()) run()
      else cancel()
    })
  }
  waitUntilReady(valid: () => boolean): Promise<boolean> {
    if (!valid()) return Promise.resolve(false)
    if (!this.paused) return Promise.resolve(true)
    return new Promise((resolve) => {
      const stop = this.subscribe(() => {
        if (valid() && this.paused) return
        stop()
        resolve(valid())
      })
    })
  }
  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
