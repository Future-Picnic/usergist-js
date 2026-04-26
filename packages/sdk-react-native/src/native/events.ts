/**
 * Native event names emitted by RitmusPushImpl (iOS) /
 * RitmusFirebaseMessagingService (Android). Keep in sync with the
 * native sides — these are the contract.
 */
export const RITMUS_PUSH_EVENTS = {
  TOKEN_RECEIVED: 'RitmusPush:tokenReceived',
  TOKEN_ERROR: 'RitmusPush:tokenError',
  NOTIFICATION_RECEIVED: 'RitmusPush:notificationReceived',
  NOTIFICATION_OPENED: 'RitmusPush:notificationOpened',
} as const

export type RitmusPushEventName =
  (typeof RITMUS_PUSH_EVENTS)[keyof typeof RITMUS_PUSH_EVENTS]

export interface TokenReceivedPayload {
  readonly token: string
  readonly platform: 'ios' | 'android'
}

export interface TokenErrorPayload {
  readonly error: string
}

export interface NotificationPayload {
  readonly title?: string
  readonly body?: string
  readonly data?: Record<string, unknown>
  readonly deliveryId?: string
  readonly actionIdentifier?: string
}
