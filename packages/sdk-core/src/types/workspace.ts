export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly region: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface WorkspaceMember {
  readonly workspaceId: string
  readonly userId: string
  readonly email: string
  readonly name?: string | null
  readonly role: WorkspaceRole
  readonly createdAt: string
}

export interface User {
  readonly id: string
  readonly email: string
  readonly name?: string | null
  readonly emailVerifiedAt?: string | null
  readonly createdAt: string
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
