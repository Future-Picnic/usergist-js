import { useEffect, useState } from 'react'

export type ModalSurface = 'prompt' | 'survey' | 'inapp' | 'requests'

let active: ModalSurface | null = null
let waiting: ModalSurface[] = []
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function request(surface: ModalSurface): void {
  if (active === surface || waiting.includes(surface)) return
  if (!active) active = surface
  else waiting = [...waiting, surface]
  notify()
}

function release(surface: ModalSurface): void {
  waiting = waiting.filter((item) => item !== surface)
  if (active !== surface) return
  active = waiting[0] ?? null
  waiting = waiting.slice(1)
  notify()
}

/** FIFO ownership for the SDK's native Modal surfaces. */
export function useModalSlot(surface: ModalSurface, requested: boolean): boolean {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const listener = (): void => setVersion((value) => value + 1)
    listeners.add(listener)
    if (requested) request(surface)
    else release(surface)
    return () => {
      listeners.delete(listener)
      release(surface)
    }
  }, [requested, surface])
  return requested && active === surface
}
