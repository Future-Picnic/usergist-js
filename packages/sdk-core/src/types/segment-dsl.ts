// ==========================================================
// Segment DSL (shared between server and SDK). The DSL is a
// JSON structure — not raw SQL — so that:
//   1. The dashboard UI can safely build/edit rules.
//   2. The SDK can evaluate a lightweight subset client-side
//      for instant trigger firing (the server re-verifies).
//   3. The server can compile the full DSL to ClickHouse SQL.
// ==========================================================

export type ScalarValue = string | number | boolean
export type ScalarList = ReadonlyArray<string | number>

export type ComparisonOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'exists'
  | 'not_exists'

export interface UserPropertyPredicate {
  readonly kind: 'user_property'
  readonly key: string
  readonly op: ComparisonOp
  readonly value?: ScalarValue | ScalarList
}

export type CountOp = 'gte' | 'lte' | 'eq' | 'gt' | 'lt'

export interface EventCountPredicate {
  readonly kind: 'event_count'
  readonly eventName: string
  readonly op: CountOp
  readonly count: number
  readonly windowDays: number
  readonly propertyFilters?: ReadonlyArray<UserPropertyPredicate>
}

export interface EventOccurredPredicate {
  readonly kind: 'event_occurred'
  readonly eventName: string
  readonly ever: boolean // true => "has ever done X", false => "has never done X"
  readonly windowDays?: number
}

export type Predicate =
  | UserPropertyPredicate
  | EventCountPredicate
  | EventOccurredPredicate

export type Combinator = 'AND' | 'OR'

export interface PredicateGroup {
  readonly combinator: Combinator
  readonly predicates: ReadonlyArray<Predicate | PredicateGroup>
}

export interface SegmentDsl {
  readonly version: 1
  readonly root: PredicateGroup
}

export function emptySegmentDsl(): SegmentDsl {
  return { version: 1, root: { combinator: 'AND', predicates: [] } }
}
