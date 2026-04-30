/**
 * Runtime types shared by the React Native, iOS, and Android SDKs for
 * the "under the hood" push primitives:
 *  • Silent reachability ping payloads
 *  • Delivery beacon contract (delivered / displayed / dismissed)
 *  • Channel registry (Android NotificationChannel + iOS category)
 *  • App-open beacon
 */

export interface SilentPushPayload {
  readonly ritmus_silent: '1'
  readonly ritmus_ping_id: string
}

export type AndroidImportance = 0 | 1 | 2 | 3 | 4

export type ChannelCategory =
  | 'transactional'
  | 'marketing'
  | 'silent'
  | 'digest'
  | 'alert'

export interface PushChannelDef {
  readonly app_id: string
  readonly channel_id: string
  readonly display_name: string
  readonly description: string | null
  readonly importance: AndroidImportance
  readonly default_sound: string | null
  readonly default_vibrate: boolean
  readonly default_badge: boolean
  readonly category: ChannelCategory
}

export interface DeliveryBeacon {
  readonly deliveryId: string
  readonly occurredAt?: string
  readonly attemptId?: string
  readonly actionButton?: string
}

export type DeliveryBeaconKind =
  | 'delivered'
  | 'displayed'
  | 'dismissed'

export interface SilentAck {
  readonly pingId: string
  readonly anonymousId: string
  readonly receivedAt?: string
}

export interface RebindRequest {
  readonly anonymousId: string
  readonly externalId: string
  readonly token: string
}

export interface AppOpenBeacon {
  readonly anonymousId: string
  readonly occurredAt?: string
}

/**
 * SDK-side recognized payload after parsing a server-sent push. Both
 * APNs (via NSE) and FCM (via FirebaseMessagingService) decode into
 * this shape so the cross-platform UI/behaviour layer can stay
 * platform-agnostic.
 */
export interface ParsedPushPayload {
  readonly campaignId: string
  readonly variantId: string
  readonly deliveryId: string
  readonly title: string
  readonly body: string
  readonly imageUrl: string | null
  readonly deepLink: string | null
  readonly language: string | null
  readonly actionButtons: ReadonlyArray<{
    readonly label: string
    readonly action: 'open_app' | 'deep_link' | 'url' | 'dismiss'
    readonly target?: string
  }>
  readonly androidChannelId: string | null
  readonly silent: boolean
  readonly silentPingId: string | null
}

/**
 * Helper used by the data-only Android branch and the iOS NSE to
 * detect a silent reachability ping.
 */
export function isSilentPushPayload(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw) return false
  return raw.ritmus_silent === '1' && typeof raw.ritmus_ping_id === 'string'
}
