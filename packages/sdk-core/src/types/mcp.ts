/** Workspace-member MCP grants. These never replace workspace role checks. */
export const MCP_DOMAINS = ['context', 'users', 'analytics', 'requests', 'roadmap', 'content', 'experiences', 'segments', 'brand', 'portal', 'push', 'integrations', 'sdk', 'apps'] as const
export type McpDomain = typeof MCP_DOMAINS[number]
export const MCP_ACCESS_MODES = ['read_only', 'approve_changes', 'automatic'] as const
export type McpAccessMode = typeof MCP_ACCESS_MODES[number]
export type McpCapability = `${McpDomain}:${'read' | 'manage' | 'publish' | 'send'}`
export const MCP_CAPABILITIES: readonly McpCapability[] = [
  'context:read', 'users:read', 'analytics:read', 'requests:read', 'requests:manage', 'requests:publish',
  'roadmap:read', 'roadmap:manage', 'roadmap:publish', 'content:read', 'content:manage', 'content:publish',
  'experiences:read', 'experiences:manage', 'experiences:publish', 'segments:read', 'segments:manage',
  'brand:read', 'brand:manage', 'portal:read', 'portal:manage', 'portal:publish', 'push:read', 'push:manage', 'push:send',
  'integrations:read', 'integrations:manage', 'integrations:send', 'sdk:read', 'sdk:manage', 'apps:read', 'apps:manage',
]
export const MCP_DEFAULT_CAPABILITIES: readonly McpCapability[] = [
  'context:read', 'users:read', 'analytics:read', 'requests:read', 'roadmap:read', 'content:read',
  'experiences:read', 'segments:read', 'brand:read', 'portal:read', 'push:read', 'sdk:read', 'apps:read',
  'requests:manage', 'roadmap:manage', 'content:manage', 'experiences:manage', 'segments:manage',
]
export type SubjectRef = { subjectId: string; externalId?: never; anonymousId?: never }
  | { externalId: string; subjectId?: never; anonymousId?: never }
  | { anonymousId: string; subjectId?: never; externalId?: never }
export interface McpConnection {
  id: string
  workspaceId: string
  userId: string
  name: string
  appIds: string[]
  capabilities: McpCapability[]
  mode: McpAccessMode
  policyVersion: number
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  connected: boolean
}
export type McpOperationStatus = 'needs_approval' | 'queued' | 'running' | 'succeeded' | 'failed' | 'indeterminate' | 'cancelled' | 'expired'
export interface McpOperationResult {
  operationId: string
  status: McpOperationStatus
  proposalId?: string
  expiresAt?: string
  preview?: { action: string; arguments: unknown; effects: string[]; asOf: string; impact?: unknown }
  approvalSource?: 'mcp_form' | 'client_managed' | 'automatic' | null
  result?: unknown
  targets?: { kind: string; id: string; appId?: string }[]
  error?: { code: string; message: string }
}
export interface McpPage<T> {
  items: T[]
  nextCursor: string | null
  asOf: string
  total?: number
  totalKind?: 'exact' | 'estimate'
}
export interface McpGrant { name: string; appIds: string[]; capabilities: McpCapability[]; mode: McpAccessMode }
export interface McpConnectionSettings { enabled: boolean; resourceUrl: string | null; mutationsEnabled?: boolean; connections: McpConnection[] }
export interface McpActivity { id: string; app_id: string | null; tool: string; status: McpOperationStatus;
  approval_source: McpOperationResult['approvalSource']; error_code: string | null; created_at: string; updated_at: string }
export type McpSearchSource = 'request' | 'feedback_answer' | 'survey_answer' | 'roadmap' | 'article' | 'changelog'
export interface AppSearchQuery { query: string; types?: McpSearchSource[]; variant?: 'draft' | 'published' | 'record'; cursor?: string; limit?: number }
export interface AppSearchResult extends McpPage<{ type: string; id: string; variant: string; title: string; excerpt: string;
  updatedAt: string; indexedAt: string; reference: { appId: string; type: string; id: string; variant: string }; url: string }> {
  index: { ready: boolean; updatedAt: string | null }; warnings: string[]
}
export interface DeliveryDiagnosticInput { kind: 'feedback' | 'survey' | 'inapp' | 'push'; entityId: string;
  subject: SubjectRef; platform: 'ios' | 'android' | 'web'; eventName?: string }
export interface DeliveryDiagnosticResult { appId: string; entityId: string; kind: DeliveryDiagnosticInput['kind']; subject: unknown; asOf: string;
  checks: { check: string; status: 'pass' | 'fail' | 'unknown' | 'not_applicable'; evidence: unknown }[]; warnings: string[] }
