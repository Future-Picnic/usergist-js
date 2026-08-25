export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly region: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Workspace as returned from the authenticated `/v1/me` projection. */
export interface WorkspaceWithRole extends Workspace {
  readonly role: WorkspaceRole
}

export interface WorkspaceMember {
  readonly workspaceId: string
  readonly userId: string
  readonly email: string
  readonly name?: string | null
  readonly role: WorkspaceRole
  readonly createdAt: string
}

export interface WorkspaceInvite {
  readonly id: string
  readonly workspaceId: string
  readonly email: string
  readonly role: Exclude<WorkspaceRole, 'owner'>
  readonly deliveryStatus: 'pending' | 'sent' | 'failed'
  readonly expiresAt: string
  readonly createdAt: string
}

export interface AcceptWorkspaceInviteRequest {
  readonly token: string
}

export interface AcceptWorkspaceInviteResponse {
  readonly workspace: Workspace
  readonly role: WorkspaceRole
  readonly alreadyMember: boolean
}

export interface User {
  readonly id: string
  readonly email: string
  readonly name?: string | null
  readonly emailVerifiedAt?: string | null
  readonly createdAt: string
  // Cross-workspace operator flag. Set on a tiny number of internal
  // accounts; surfaced so the dashboard can render the /admin
  // surface. SDK consumers never see this — it's only populated by
  // /v1/me which write-keys can't call.
  readonly isSuperAdmin?: boolean
}

export interface App {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly slug: string
  readonly platforms: ReadonlyArray<'ios' | 'android' | 'react-native' | 'flutter'>
  readonly piiAllowList: ReadonlyArray<string>
  readonly lifecycleEventsEnabled: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface WriteKey {
  readonly id: string
  readonly appId: string
  readonly keyPrefix: string
  readonly environment: 'production' | 'staging' | 'development'
  readonly label?: string | null
  readonly revokedAt?: string | null
  readonly lastUsedAt?: string | null
  readonly createdAt: string
}

export interface CreatedWriteKey extends WriteKey {
  readonly plaintext: string // only returned on creation
}

/**
 * Request body for `POST /v1/apps/:appId/write-keys/:keyId/rotate`. The grace
 * window is how long the old key keeps authenticating before the API starts
 * returning 401 — gives SDK consumers a deploy window before the cutover.
 */
export interface RotateWriteKeyRequest {
  readonly graceSeconds?: number
}

/**
 * Response from a successful key rotation. The new key's plaintext is
 * returned ONCE and never again — operators must capture it on rotation.
 */
export interface RotateWriteKeyResponse {
  readonly newKey: CreatedWriteKey
  readonly oldKey: WriteKey
  readonly oldKeyExpiresAt: string
}
