/**
 * Canonical event names emitted by the push pillar. These land in the
 * events pipeline so segments can query them like any other event.
 */
export const PUSH_EVENTS = {
  SENT: '$push_sent',
  DELIVERED: '$push_delivered',
  OPENED: '$push_opened',
  CLICKED: '$push_clicked',
  RECEIVED: '$push_received',
  ACTION_CLICKED: '$push_action_clicked',
} as const

export type PushEventName = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS]
