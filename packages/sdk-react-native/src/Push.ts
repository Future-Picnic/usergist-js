/**
 * Ritmus Push — React Native public surface.
 *
 * Host apps own APNs / FCM plumbing (via `@react-native-firebase/messaging`
 * or `notifee`). They forward tokens and message payloads here.
 */

import { Ritmus } from './Ritmus.js'

export type PushPermissionStatus =
  | 'not_determined'
  | 'denied'
  | 'granted'
  | 'provisional'
  | 'ephemeral'

export interface RitmusPushMessage {
  readonly campaignId?: string
  readonly variantId?: string
  readonly deliveryId?: string
  readonly language?: string
  readonly deepLink?: string
  readonly title?: string
  readonly body?: string
}

export interface PushHandlers {
  readonly onReceive?: (message: RitmusPushMessage, raw: Record<string, unknown>) => void
  readonly onOpen?: (message: RitmusPushMessage) => void
  readonly onAction?: (message: RitmusPushMessage, actionButton: string) => void
}

let handlers: PushHandlers = {}

export function parseIosPayload(userInfo: Record<string, unknown>): RitmusPushMessage | null {
  const ritmus = userInfo?.['ritmus'] as Record<string, unknown> | undefined
  if (!ritmus) return null
  const aps = userInfo?.['aps'] as Record<string, unknown> | undefined
  const alert = aps?.['alert'] as Record<string, unknown> | undefined
  return {
    campaignId: ritmus['campaignId'] as string | undefined,
    variantId: ritmus['variantId'] as string | undefined,
    deliveryId: ritmus['deliveryId'] as string | undefined,
    language: ritmus['language'] as string | undefined,
    deepLink: ritmus['deepLink'] as string | undefined,
    title: alert?.['title'] as string | undefined,
    body: alert?.['body'] as string | undefined,
  }
}

export function parseFcmData(
  data: Record<string, string>,
  notification?: { title?: string; body?: string },
): RitmusPushMessage | null {
  if (!data.ritmus_campaign_id) return null
  return {
    campaignId: data.ritmus_campaign_id,
    variantId: data.ritmus_variant_id,
    deliveryId: data.ritmus_delivery_id,
    language: data.ritmus_language,
    deepLink: data.ritmus_deep_link,
    title: notification?.title,
    body: notification?.body,
  }
}

function emitEvent(
  name: '$push_received' | '$push_opened' | '$push_action_clicked',
  msg: RitmusPushMessage,
  extra?: Record<string, unknown>,
): void {
  Ritmus.track(name, {
    campaign_id: msg.campaignId ?? null,
    variant_id: msg.variantId ?? null,
    delivery_id: msg.deliveryId ?? null,
    language: msg.language ?? null,
    ...(extra ?? {}),
  })
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
    // Delegate to the Ritmus core; it has access to identity + transport.
    await Ritmus.registerPushToken(token, platform, opts)
  },

  async invalidateDeviceToken(token: string): Promise<void> {
    await Ritmus.invalidatePushToken(token)
  },

  handleReceived(args: {
    userInfo?: Record<string, unknown>
    data?: Record<string, string>
    notification?: { title?: string; body?: string }
  }): void {
    const msg =
      args.userInfo !== undefined
        ? parseIosPayload(args.userInfo)
        : args.data
          ? parseFcmData(args.data, args.notification)
          : null
    if (!msg) return
    emitEvent('$push_received', msg)
    handlers.onReceive?.(msg, (args.userInfo ?? args.data ?? {}) as Record<string, unknown>)
  },

  handleOpened(args: {
    userInfo?: Record<string, unknown>
    data?: Record<string, string>
    actionIdentifier?: string
  }): void {
    const msg =
      args.userInfo !== undefined
        ? parseIosPayload(args.userInfo)
        : args.data
          ? parseFcmData(args.data)
          : null
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
