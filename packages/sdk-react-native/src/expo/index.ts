import { Platform } from 'react-native'
import { UserGist } from '../UserGist.js'
import { Push } from '../Push.js'
import { setPushAdapter } from '../native/push-adapter.js'
import type { PushPermissionStatus } from '../NativeUserGistPush.js'

export { UserGist, Push } from '../index.js'
export { UserGistProvider } from '../Provider.js'

type Subscription = { remove(): void }
type Permission = { granted: boolean; canAskAgain?: boolean; status: string; ios?: { status: number } }
type Notification = { request: { identifier: string; content: { data?: Record<string, unknown>; title?: string | null; body?: string | null }; trigger?: unknown } }
type Response = { notification: Notification; actionIdentifier: string }
/** Structural interface: importing the base SDK never imports expo-notifications. */
export interface ExpoNotifications {
  getPermissionsAsync(): Promise<Permission>
  requestPermissionsAsync(): Promise<Permission>
  getDevicePushTokenAsync(): Promise<{ type: string; data: string | object }>
  addPushTokenListener(listener: (token: { type: string; data: string | object }) => void): Subscription
  addNotificationReceivedListener(listener: (notification: Notification) => void): Subscription
  addNotificationResponseReceivedListener(listener: (response: Response) => void): Subscription
  getLastNotificationResponseAsync(): Promise<Response | null>
  setBadgeCountAsync(count: number): Promise<boolean>
  setNotificationChannelAsync(id: string, channel: { name: string; importance: number }): Promise<unknown>
  DEFAULT_ACTION_IDENTIFIER: string
}

function permissionStatus(p: Permission): PushPermissionStatus {
  if (p.ios?.status === 3 || p.ios?.status === 4) return 'provisional'
  if (p.granted) return 'authorized'
  return p.status === 'undetermined' ? 'not_determined' : 'denied'
}

export function expoPushPayload(notification: Notification) {
  const { data = {}, title, body } = notification.request.content
  if (Platform.OS === 'ios') {
    // Native APNs payload lives on the trigger; Expo content.data may omit aps.
    const trigger = notification.request.trigger as { payload?: Record<string, unknown> } | undefined
    const payload = trigger?.payload ?? data
    if (payload.usergist_anonymous_id && payload.usergist_anonymous_id !== UserGist.getAnonymousId()) return null
    if (!payload.usergist && payload.usergist_silent !== '1') return null
    return { userInfo: { ...payload, aps: payload.aps ?? { alert: { title, body } } } }
  }
  if (data.usergist_anonymous_id && data.usergist_anonymous_id !== UserGist.getAnonymousId()) return null
  if (!data.usergist_campaign_id && data.usergist_silent !== '1') return null
  const strings = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  return { data: strings, notification: { title: title ?? undefined, body: body ?? undefined } }
}

let configured: { notifications: ExpoNotifications; dispose: () => void } | null = null
export function configureExpoNotifications(notifications: ExpoNotifications): () => void {
  if (configured) {
    if (configured.notifications !== notifications) throw new Error('A different Expo notification adapter is already configured')
    return configured.dispose
  }
  if (UserGist.__internal_state().config) throw new Error('Call configureExpoNotifications before UserGist.initAsync')
  let enabled = false
  let disposed = false
  let generation = 0
  let environment: 'sandbox' | 'production' | undefined
  const platform = Platform.OS === 'ios' ? 'ios' : 'android'
  const active = () => enabled && !disposed && Boolean(UserGist.__internal_state().consent?.push)
  const receive = (notification: Notification) => {
    if (!active()) return
    const args = expoPushPayload(notification)
    if (args) void Push.handleSilentIfPresent(args).then(silent => { if (!silent && active()) Push.handleReceived(args) })
  }
  const respond = (response: Response) => {
    if (!active()) return
    const args = expoPushPayload(response.notification)
    if (args) Push.handleOpened({ ...args, actionIdentifier: response.actionIdentifier === notifications.DEFAULT_ACTION_IDENTIFIER ? undefined : response.actionIdentifier })
  }
  const uninstall = setPushAdapter({
    async enablePush(options) {
      const current = ++generation
      enabled = false
      environment = options.environment
      // A channel must exist before Android 13 can request notification permission.
      if (platform === 'android') await notifications.setNotificationChannelAsync('usergist_default', { name: 'Notifications', importance: 3 })
      let permission = await notifications.getPermissionsAsync()
      if (!permission.granted && permission.ios?.status !== 3 && permission.canAskAgain !== false && !(options.skipPermissionRequestIfDenied && permissionStatus(permission) === 'denied')) {
        permission = await notifications.requestPermissionsAsync()
      }
      const status = permissionStatus(permission)
      if (disposed || current !== generation) return { granted: false, status: 'not_determined', platform }
      if (status !== 'authorized' && status !== 'provisional') return { granted: false, status, platform }
      const token = await notifications.getDevicePushTokenAsync()
      if (disposed || current !== generation) return { granted: false, status: 'not_determined', platform }
      if (token.type !== platform || typeof token.data !== 'string' || /^(ExponentPushToken|ExpoPushToken)\[/.test(token.data)) throw new Error('UserGist requires a native APNs/FCM token')
      // Keep this response cached in Expo; our delivery/action dedupe prevents replay.
      const initial = await notifications.getLastNotificationResponseAsync()
      if (disposed || current !== generation) return { granted: false, status: 'not_determined', platform }
      enabled = true
      if (initial && active()) respond(initial)
      return { granted: true, status, token: token.data, platform }
    },
    async disablePush() { generation++; enabled = false },
    async getPermissionStatus() { return permissionStatus(await notifications.getPermissionsAsync()) },
    async setBadgeCount(count) { await notifications.setBadgeCountAsync(count) },
  })
  const subscriptions = [
    notifications.addPushTokenListener(token => {
      if (active() && token.type === platform && typeof token.data === 'string' && !/^(ExponentPushToken|ExpoPushToken)\[/.test(token.data)) {
        void Push.registerDeviceToken(token.data, platform, { environment })
      }
    }),
    notifications.addNotificationReceivedListener(receive),
    notifications.addNotificationResponseReceivedListener(respond),
  ]
  const dispose = () => {
    if (disposed) return
    disposed = true; enabled = false; generation++
    subscriptions.forEach(s => s.remove())
    uninstall()
    configured = null
  }
  configured = { notifications, dispose }
  return dispose
}
