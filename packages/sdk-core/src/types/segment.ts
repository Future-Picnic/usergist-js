import type { SerializedSegmentRules } from './prompt.js'

export interface Segment {
  readonly id: string
  readonly appId: string
  readonly name: string
  readonly description?: string
  readonly rules: SerializedSegmentRules
  readonly createdAt: string
  readonly updatedAt: string
}
