import type { RequestStatus } from './request.js'

export interface PortalApp {
  appId: string
  name: string
  slug: string
  enabled: boolean
  firstPublishedAt: string | null
  url: string | null
  branding: { accentColor: string; logoUrl: string | null; introCopy: string | null }
}
export interface PortalSettings {
  baseDomain: string
  workspaceId: string
  displayName: string
  slug: string | null
  published: boolean
  firstPublishedAt: string | null
  url: string | null
  hostingReady: boolean
  setupDismissed: boolean
  apps: PortalApp[]
}
export interface PublicPortal {
  slug: string
  displayName: string
  url: string
  apps: Pick<PortalApp, 'name' | 'slug' | 'url' | 'branding'>[]
}
export interface PortalRequest {
  id: string
  title: string
  description: string
  status: RequestStatus
  upvoteCount: number
  createdAt: string
  statusChangedAt: string
  devResponse: string | null
  mergedIntoId: string | null
}
export interface PortalRequestList {
  items: PortalRequest[]
  total: number
  page: number
  hasMore: boolean
}
export interface PortalRequestQuery {
  q?: string
  status?: RequestStatus
  sort?: 'top' | 'newest' | 'status_changed'
  page?: number
  limit?: number
}
export interface PortalSession { email: string; expiresAt: string }
export interface UpdatePortalRequest { displayName?: string; slug?: string; setupDismissed?: boolean }
export interface UpdatePortalAppRequest { slug: string; enabled: boolean }
/** Reserve an app's public address as part of app creation, without publishing it. */
export interface CreateAppPortal {
  appSlug: string
  company?: { displayName: string; slug: string }
}
export interface PortalAuthStart { email: string }
export interface PortalAuthVerify { email: string; code: string }
export interface PortalSubmission { title: string; description: string; idempotencyKey: string; feedbackConsent: true }
export interface PortalVote { vote: boolean; feedbackConsent: true }

export const PORTAL_RESERVED_SLUGS: readonly string[] = [
  'www', 'app', 'api', 'admin', 'auth', 'portal', 'docs', 'status', 'mail',
  'support', 'login', 'logout', 'signup', 'billing', 'dashboard', 'cdn',
  'assets', 'static', 'smtp', 'ftp', 'help', 'account', 'accounts', 'developer',
]
export const PORTAL_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46})[a-z0-9]$/
export function validPortalSlug(slug: string): boolean {
  return PORTAL_SLUG_PATTERN.test(slug) && !PORTAL_RESERVED_SLUGS.includes(slug)
}
export function suggestPortalSlug(name: string): string {
  const value = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '')
  return validPortalSlug(value) ? value : value.length >= 3 ? `${value.slice(0, 40)}-team` : ''
}
export function buildPortalUrl(slug: string, baseDomain = 'usergist.com', appSlug?: string): string {
  if (!validPortalSlug(slug) || !/^[a-z0-9.-]+$/i.test(baseDomain)) throw new Error('Invalid portal address')
  const base = `https://${slug}.${baseDomain}`
  return appSlug ? `${base}/${encodeURIComponent(appSlug)}/requests` : base
}
