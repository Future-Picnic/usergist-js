import type { EnablePushOptions, EnablePushResult, PushPermissionStatus } from '../NativeUserGistPush.js'

/** Optional host-owned notification acquisition; native persistence remains shared. */
export interface PushAdapter {
  enablePush(options: EnablePushOptions): Promise<EnablePushResult>
  disablePush(): Promise<void>
  getPermissionStatus(): Promise<PushPermissionStatus>
  setBadgeCount(count: number): Promise<void>
}
let adapter: PushAdapter | null = null
export function getPushAdapter(): PushAdapter | null { return adapter }
export function setPushAdapter(next: PushAdapter): () => void {
  if (adapter) throw new Error('UserGist notification adapter is already configured')
  adapter = next
  return () => { if (adapter === next) adapter = null }
}
