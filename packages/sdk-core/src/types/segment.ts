import type { SerializedSegmentRules } from './prompt.js'
import type { AudienceSpec } from './targeting.js'

export interface Segment {
  readonly id: string
  readonly appId: string
  readonly name: string
  readonly description?: string
  // New segments persist `definition: AudienceSpec` (the same shape
  // feedback / surveys / push targeting use). Legacy segments still
  // surface their `rules: SegmentDsl` blob for back-compat. Exactly
  // one is non-null on any given record.
  readonly definition: AudienceSpec | null
  readonly rules: SerializedSegmentRules | null
  readonly createdAt: string
  readonly updatedAt: string
}
