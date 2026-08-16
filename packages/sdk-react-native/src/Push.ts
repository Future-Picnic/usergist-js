/**
 * UserGist Push — React Native public surface.
 *
 * Host apps own APNs / FCM plumbing (via `@react-native-firebase/messaging`
 * or `notifee`). They forward tokens and message payloads here.
 *
 * Includes the "under the hood" primitives:
 *  • Silent reachability ping detection + ack
 *  • Real delivered / displayed / dismissed beacons
 *  • Channel registry fetch (Android NotificationChannel registration)
 *  • App-open beacon for adaptive ping policy
 *  • Token rebind on identify
 */

import { isSilentPushPayload, type PushChannelDef } from '@usergist/sdk-core'
import { UserGist } from './UserGist.js'

export type PushPermissionStatus =
  | 'not_determined'
  | 'denied'
  | 'granted'
  | 'provisional'
  | 'ephemeral'

export interface UserGistPushMessage {
  readonly campaignId?: string
  readonly variantId?: string
  readonly deliveryId?: string
  readonly language?: string
  readonly deepLink?: string
  readonly title?: string
  readonly body?: string
  readonly imageUrl?: string
  readonly androidChannelId?: string
}

export interface PushHandlers {
  readonly onReceive?: (message: UserGistPushMessage, raw: Record<string, unknown>) => void
  readonly onOpen?: (message: UserGistPushMessage) => void
  readonly onAction?: (message: UserGistPushMessage, actionButton: string) => void
  readonly onDismiss?: (message: UserGistPushMessage) => void
  readonly onSilent?: (pingId: string) => void
}

let handlers: PushHandlers = {}

export function parseIosPayload(userInfo: Record<string, unknown>): UserGistPushMessage | null {
  const usergist = userInfo?.['usergist'] as Record<string, unknown> | undefined
  if (!usergist) return null
  const aps = userInfo?.['aps'] as Record<string, unknown> | undefined
  const alert = aps?.['alert'] as Record<string, unknown> | undefined
  const extra = usergist['extra'] as Record<string, unknown> | undefined
  return {
    campaignId: usergist['campaignId'] as string | undefined,
    variantId: usergist['variantId'] as string | undefined,
    deliveryId: usergist['deliveryId'] as string | undefined,
    language: usergist['language'] as string | undefined,
    deepLink: usergist['deepLink'] as string | undefined,
    title: alert?.['title'] as string | undefined,
    body: alert?.['body'] as string | undefined,
    imageUrl: extra?.['imageUrl'] as string | undefined,
  }
}

export function parseFcmData(
  data: Record<string, string>,
  notification?: { title?: string; body?: string },
): UserGistPushMessage | null {
  if (!data.usergist_campaign_id) return null
  return {
    campaignId: data.usergist_campaign_id,
    variantId: data.usergist_variant_id,
    deliveryId: data.usergist_delivery_id,
    language: data.usergist_language,
    deepLink: data.usergist_deep_link,
    title: notification?.title ?? data.usergist_title,
    body: notification?.body ?? data.usergist_body,
    imageUrl: data.usergist_image_url,
    androidChannelId: data.usergist_channel_id,
  }
}

function emitEvent(
  name:
    | '$push_received'
    | '$push_displayed'
    | '$push_opened'
    | '$push_dismissed'
    | '$push_action_clicked',
  msg: UserGistPushMessage,
  extra?: Record<string, unknown>,
): void {
  const props = {
    campaign_id: msg.campaignId ?? null,
    variant_id: msg.variantId ?? null,
    delivery_id: msg.deliveryId ?? null,
    language: msg.language ?? null,
    ...(extra ?? {}),
  }
  UserGist.track(name, props)
  // Also surface to host-app subscribers (e.g. Amplitude / Mixpanel /
  // Segment) via the public `onPushEvent` API. Analytics-tool agnostic
  // — the host plumbs to whichever stack they use.
  UserGist._notifyPushEvent(name, props)
}

interface PushHandlerArgs {
  readonly userInfo?: Record<string, unknown>
  readonly data?: Record<string, string>
  readonly notification?: { title?: string; body?: string }
}

function parsePushArgs(args: PushHandlerArgs): UserGistPushMessage | null {
  if (args.userInfo !== undefined) return parseIosPayload(args.userInfo)
  if (args.data) return parseFcmData(args.data, args.notification)
  return null
}

export const Push = {
  setHandlers(h: PushHandlers): void {
    handlers = h
  },

  async registerDeviceToken(
    token: string,
    platform: 'ios' | 'android',
    opts?: { environment?: 'production' | 'sandbox' },
  ): Promise<void> {
    if (!token) return
    await UserGist.registerPushToken(token, platform, opts)
  },

  async invalidateDeviceToken(token: string): Promise<void> {
    await UserGist.invalidatePushToken(token)
  },

  /**
   * Forwarded by the host app's `applicationDidBecomeActive` /
   * `onResume`. Powers the adaptive reachability policy — recently-active
   * users skip silent-ping cycles entirely.
   */
  async appDidBecomeActive(): Promise<void> {
    await UserGist.pushAppOpen()
  },

  /**
   * Pull the per-app channel registry and let the host (or Android SDK
   * native module) create/update notification channels at app launch.
   * Required on Android 8+: notifications without a registered channel
   * are silently dropped.
   */
  async fetchChannels(): Promise<ReadonlyArray<PushChannelDef>> {
    return UserGist.pushFetchChannels()
  },

  async setChannelSubscription(channelId: string, subscribed: boolean): Promise<void> {
    await UserGist.pushSetChannelSubscription(channelId, subscribed)
  },

  /**
   * Recognize and ack a silent reachability push. Called by the host's
   * notification handler before any UI work. Returns true if the
   * payload was a silent ping (the host should NOT show anything).
   */
  async handleSilentIfPresent(args: {
    userInfo?: Record<string, unknown>
    data?: Record<string, string>
  }): Promise<boolean> {
    const raw = (args.userInfo ?? args.data ?? {}) as Record<string, unknown>
    if (!isSilentPushPayload(raw)) return false
    const pingId = String(raw.usergist_ping_id ?? '')
    if (!pingId) return true
    handlers.onSilent?.(pingId)
    await UserGist.pushAckSilent(pingId)
    return true
  },

  /**
   * Beacon: device received the push (NSE / Android FCM data handler).
   * Distinct from $push_received (which is emitted when the SDK first
   * sees the payload in user-facing code paths).
   */
  async beaconDelivered(deliveryId: string): Promise<void> {
    if (!deliveryId) return
    await UserGist.pushBeacon('delivered', deliveryId)
  },

  /** Beacon: SDK rendered a local notification (Android data-only path). */
  async beaconDisplayed(deliveryId: string): Promise<void> {
    if (!deliveryId) return
    await UserGist.pushBeacon('displayed', deliveryId)
  },

  /** Beacon: user dismissed the notification without opening. */
  async beaconDismissed(deliveryId: string): Promise<void> {
    if (!deliveryId) return
    await UserGist.pushBeacon('dismissed', deliveryId)
  },

  handleReceived(args: PushHandlerArgs): void {
    const msg = parsePushArgs(args)
    if (!msg) return
    emitEvent('$push_received', msg)
    handlers.onReceive?.(msg, (args.userInfo ?? args.data ?? {}) as Record<string, unknown>)
  },

  handleDisplayed(args: PushHandlerArgs): void {
    const msg = parsePushArgs(args)
    if (!msg) return
    emitEvent('$push_displayed', msg)
    if (msg.deliveryId) void UserGist.pushBeacon('displayed', msg.deliveryId)
  },

  handleDismissed(args: PushHandlerArgs): void {
    const msg = parsePushArgs(args)
    if (!msg) return
    emitEvent('$push_dismissed', msg)
    if (msg.deliveryId) void UserGist.pushBeacon('dismissed', msg.deliveryId)
    handlers.onDismiss?.(msg)
  },

  handleOpened(args: PushHandlerArgs & { actionIdentifier?: string }): void {
    const msg = parsePushArgs(args)
    if (!msg) return
    if (args.actionIdentifier) {
      emitEvent('$push_action_clicked', msg, { action_button: args.actionIdentifier })
      handlers.onAction?.(msg, args.actionIdentifier)
    } else {
      emitEvent('$push_opened', msg)
      handlers.onOpen?.(msg)
    }
  },
}
