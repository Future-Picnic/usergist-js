export type SupportStatus = 'open' | 'waiting_on_customer' | 'closed'
export type SupportAuthorKind = 'visitor' | 'staff'
export type SupportNotificationStatus = 'pending' | 'sent' | 'failed'

export interface SupportNotification {
  readonly id: string
  readonly kind: 'visitor_confirmation' | 'visitor_team_reply' | 'staff_new_ticket' | 'staff_customer_reply'
  readonly status: SupportNotificationStatus
  readonly canRetry: boolean
  readonly attempts: number
  readonly lastError: string | null
}

export interface SupportMessage {
  readonly id: string
  readonly ticketId: string
  readonly authorKind: SupportAuthorKind
  readonly authorName: string | null
  readonly body: string
  readonly createdAt: string
  readonly notifications: ReadonlyArray<SupportNotification>
}

export interface SupportTicket {
  readonly id: string
  readonly subject: string
  readonly status: SupportStatus
  readonly version: number
  readonly visitorEmail?: string
  readonly latestActivityAt: string
  readonly createdAt: string
}

export interface SupportTicketDetail extends SupportTicket {
  readonly messages: SupportMessagePage
}

export interface SupportTicketPage {
  readonly items: ReadonlyArray<SupportTicket>
  readonly nextCursor: string | null
}

export interface SupportMessagePage {
  readonly items: ReadonlyArray<SupportMessage>
  readonly nextCursor: string | null
}

export interface SupportSettings {
  readonly available: boolean
  readonly enabled: boolean
  readonly notificationUserId: string | null
  readonly recipientMissing: boolean
}

export interface SupportSummary { readonly openCount: number }
export interface CreateSupportTicketRequest { readonly subject: string; readonly body: string; readonly idempotencyKey: string }
export interface CreateSupportMessageRequest { readonly body: string; readonly idempotencyKey: string }
export interface UpdateSupportTicketRequest { readonly status: SupportStatus; readonly expectedVersion: number }
export interface UpdateSupportSettingsRequest { readonly enabled: boolean; readonly notificationUserId: string | null }
export interface SupportPageQuery { readonly cursor?: string; readonly limit?: number }
export interface SupportTicketQuery extends SupportPageQuery { readonly status?: SupportStatus }
