/**
 * Native event names emitted by UserGistPushImpl (iOS) /
 * UserGistFirebaseMessagingService (Android). Keep in sync with the
 * native sides — these are the contract.
 */
export const USERGIST_PUSH_EVENTS = {
  TOKEN_RECEIVED: 'UserGistPush:tokenReceived',
  TOKEN_ERROR: 'UserGistPush:tokenError',
  NOTIFICATION_RECEIVED: 'UserGistPush:notificationReceived',
  NOTIFICATION_OPENED: 'UserGistPush:notificationOpened',
} as const

export type UserGistPushEventName =
  (typeof USERGIST_PUSH_EVENTS)[keyof typeof USERGIST_PUSH_EVENTS]

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
