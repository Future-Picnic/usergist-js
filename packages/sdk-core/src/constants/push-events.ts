/**
 * Canonical event names emitted by the push pillar. These land in the
 * events pipeline so segments can query them like any other event.
 */
export const PUSH_EVENTS = {
  SENT: '$push_sent',
  DELIVERED: '$push_delivered',
  DISPLAYED: '$push_displayed',
  RECEIVED: '$push_received',
  OPENED: '$push_opened',
  DISMISSED: '$push_dismissed',
  CLICKED: '$push_clicked',
  ACTION_CLICKED: '$push_action_clicked',
  BOUNCED: '$push_bounced',
  SILENT_ACK: '$push_silent_ack',
} as const

export type PushEventName = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS]
