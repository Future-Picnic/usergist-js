export type PortalSection = 'requests' | 'roadmap' | 'help' | 'changelog'
export type DocumentKind = 'article' | 'changelog'
export type ContentState = 'draft' | 'published' | 'archived'
export type RoadmapStatus = 'planned' | 'in_progress' | 'shipped'
export type ChangelogCategory = 'new' | 'improved' | 'fixed'
export interface ContentMark {
  type: 'bold' | 'italic' | 'code' | 'link'
  attrs?: { href: string }
}
export interface ContentNode {
  type:
    | 'doc'
    | 'paragraph'
    | 'heading'
    | 'text'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'blockquote'
    | 'codeBlock'
    | 'hardBreak'
    | 'image'
  text?: string
  attrs?: { level?: number; start?: number; language?: string | null; assetId?: string; alt?: string }
  marks?: ContentMark[]
  content?: ContentNode[]
}
export interface ContentLink {
  kind: 'request' | 'roadmap'
  id: string
}
export interface PublicContentLink extends ContentLink {
  title: string
  url: string
}
export interface DocumentDraft {
  title: string
  summary: string
  body: ContentNode
  collectionId: string | null
  category: ChangelogCategory
  releaseDate: string
  version: string
  links: ContentLink[]
}
export interface PortalDocument {
  id: string
  kind: DocumentKind
  draft: DocumentDraft
  state: ContentState
  revision: number
  slug: string | null
  publishedAt: string | null
  firstPublishedAt: string | null
  updatedAt: string
  hasChanges: boolean
  url: string | null
  canPublish: boolean
  position: number
}
export interface PublicPortalDocument {
  id: string
  title: string
  summary: string
  body: ContentNode
  slug: string
  url: string
  updatedAt: string
  category: ChangelogCategory
  releaseDate: string
  version: string
  collection: HelpCollection | null
  links: PublicContentLink[]
}
export interface PublicDocumentSummary {
  id: string
  title: string
  summary: string
  slug: string
  url: string
  updatedAt: string
  category: ChangelogCategory
  releaseDate: string
  version: string
  /** Full published body; present for changelog entries so the portal can show release notes inline. */
  body?: ContentNode
}
export interface HelpCollection {
  id: string
  title: string
  description: string
  slug: string
  position: number
  revision: number
  archived: boolean
  articleCount: number
}
export interface ContentPage<T> {
  items: T[]
  nextCursor: string | null
}
export interface ContentQuery {
  q?: string
  state?: ContentState
  collectionId?: string
  category?: ChangelogCategory
  cursor?: string
  limit?: number
}
export interface CreateDocument {
  idempotencyKey: string
  title?: string
  collectionId?: string | null
  links?: ContentLink[]
}
export type ContentPageQuery = Pick<ContentQuery, 'cursor' | 'limit'>
export interface SaveDocument {
  revision: number
  draft: DocumentDraft
}
export interface ContentAction {
  revision: number
  action: 'publish' | 'unpublish' | 'archive' | 'restore'
}
export interface CreateCollection {
  title: string
  description: string
  idempotencyKey: string
}
export interface UpdateCollection {
  revision: number
  title?: string
  description?: string
  archived?: boolean
}
export interface ReorderContent {
  revision: number
  direction: 'up' | 'down'
}
export interface RoadmapRequestLink {
  id: string
  title: string
  status: string
  updatedAt: string
  hidden: boolean
  portalVisible: boolean
}
export interface RoadmapItem {
  id: string
  title: string
  description: string
  status: RoadmapStatus
  state: ContentState
  revision: number
  statusChangedAt: string
  updatedAt: string
  requests: RoadmapRequestLink[]
  url: string | null
  canPublish: boolean
}
export interface RoadmapCard {
  id: string
  kind: 'request' | 'item'
  title: string
  description: string
  status: RoadmapStatus
  statusChangedAt: string
  published: boolean
  url: string | null
  upvoteCount?: number
}
export interface PublicRoadmapItem {
  id: string
  title: string
  description: string
  status: RoadmapStatus
  statusChangedAt: string
  links: PublicContentLink[]
  changelog: ContentPage<PublicDocumentSummary>
}
export interface RoadmapQuery {
  status: RoadmapStatus
  cursor?: string
  limit?: number
  archived?: boolean
}
export interface CreateRoadmapItem {
  idempotencyKey: string
  title: string
  description: string
  status: RoadmapStatus
  requestIds: string[]
}
export interface SaveRoadmapItem {
  revision: number
  title: string
  description: string
  requestIds: string[]
}
export interface MoveRoadmapItem {
  revision: number
  status: RoadmapStatus
  requests: { id: string; updatedAt: string }[]
}
export interface PortalAsset {
  id: string
  width: number
  height: number
  bytes: number
}
/** Multipart file body with idempotencyKey sent in the Idempotency-Key header. */
export interface PortalAssetUpload {
  file: Blob
  idempotencyKey: string
}
export function emptyDocumentDraft(): DocumentDraft {
  return {
    title: '',
    summary: '',
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    collectionId: null,
    category: 'improved',
    releaseDate: new Date().toISOString().slice(0, 10),
    version: '',
    links: [],
  }
}
export function contentText(node: ContentNode): string {
  return (
    node.text ??
    (node.content ?? [])
      .map(contentText)
      .join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n')
  )
}
export function contentAssetIds(node: ContentNode): string[] {
  return [
    ...new Set([
      ...(node.type === 'image' && node.attrs?.assetId ? [node.attrs.assetId] : []),
      ...(node.content ?? []).flatMap(contentAssetIds),
    ]),
  ]
}
export function contentSlug(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 96)
      .replace(/-$/, '') || 'article'
  )
}
export function safeContentHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/[^/]|#[a-zA-Z0-9_-])/.test(href) && !/[\u0000-\u0020\\]/.test(href)
}

export interface ContentLinkTarget extends ContentLink {
  title: string
  status: string
}
export interface ContentLinkQuery {
  kind: 'request' | 'roadmap'
  q?: string
  cursor?: string
  limit?: number
  ids?: string
}
