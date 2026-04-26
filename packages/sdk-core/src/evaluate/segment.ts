import type {
  Predicate,
  PredicateGroup,
  SegmentDsl,
  UserPropertyPredicate,
  EventCountPredicate,
  EventOccurredPredicate,
} from '../types/segment-dsl.js'
import type {
  SerializedSegmentRules,
  UserPropertyRule,
  EventCountRule,
} from '../types/prompt.js'

export interface UserState {
  readonly properties: Readonly<Record<string, string | number | boolean | null | undefined>>
  // eventCounts: eventName -> map of windowDays -> count
  readonly eventCounts: Readonly<Record<string, Readonly<Record<number, number>>>>
  // lastEventAt: eventName -> ISO timestamp (most recent)
  readonly lastEventAt: Readonly<Record<string, string | undefined>>
}

/**
 * Evaluate a segment DSL against a user snapshot.
 *
 * @param now - Reference timestamp (ms since epoch) used for time-window
 *   predicates. MUST be supplied explicitly so evaluation is deterministic
 *   across processes (server trigger engine + client SDK), independent of
 *   wall-clock skew. Defaults to `Date.now()` for backwards compatibility,
 *   but callers that care about parity should pass the same `now` they pass
 *   to the matching server-side call.
 */
export function evaluateSegment(
  dsl: SegmentDsl,
  user: UserState,
  now: number = Date.now(),
): boolean {
  return evaluateGroup(dsl.root, user, now)
}

function evaluateGroup(group: PredicateGroup, user: UserState, now: number): boolean {
  if (group.predicates.length === 0) return true
  if (group.combinator === 'AND') {
    return group.predicates.every((p) => evaluateNode(p, user, now))
  }
  return group.predicates.some((p) => evaluateNode(p, user, now))
}

function evaluateNode(node: Predicate | PredicateGroup, user: UserState, now: number): boolean {
  if ('combinator' in node) return evaluateGroup(node, user, now)
  switch (node.kind) {
    case 'user_property':
      return evaluateUserProperty(node, user)
    case 'event_count':
      return evaluateEventCount(node, user)
    case 'event_occurred':
      return evaluateEventOccurred(node, user, now)
  }
}

function evaluateUserProperty(p: UserPropertyPredicate, user: UserState): boolean {
  const actual = user.properties[p.key]
  switch (p.op) {
    case 'exists':
      return actual !== undefined && actual !== null
    case 'not_exists':
      return actual === undefined || actual === null
    case 'eq':
      return actual === p.value
    case 'neq':
      return actual !== p.value
    case 'in':
      return Array.isArray(p.value) && actual != null && (p.value as ReadonlyArray<unknown>).includes(actual)
    case 'nin':
      return Array.isArray(p.value) && actual != null && !(p.value as ReadonlyArray<unknown>).includes(actual)
    case 'gt':
      return typeof actual === 'number' && typeof p.value === 'number' && actual > p.value
    case 'gte':
      return typeof actual === 'number' && typeof p.value === 'number' && actual >= p.value
    case 'lt':
      return typeof actual === 'number' && typeof p.value === 'number' && actual < p.value
    case 'lte':
      return typeof actual === 'number' && typeof p.value === 'number' && actual <= p.value
    case 'contains':
      return typeof actual === 'string' && typeof p.value === 'string' && actual.includes(p.value)
    case 'starts_with':
      return typeof actual === 'string' && typeof p.value === 'string' && actual.startsWith(p.value)
  }
}

function evaluateEventCount(p: EventCountPredicate, user: UserState): boolean {
  const eventBucket = user.eventCounts[p.eventName]
  const count = eventBucket?.[p.windowDays] ?? 0
  switch (p.op) {
    case 'eq': return count === p.count
    case 'gte': return count >= p.count
    case 'lte': return count <= p.count
    case 'gt': return count > p.count
    case 'lt': return count < p.count
  }
}

function evaluateEventOccurred(p: EventOccurredPredicate, user: UserState, now: number): boolean {
  const last = user.lastEventAt[p.eventName]
  if (p.ever) {
    if (!last) return false
    if (p.windowDays == null) return true
    const cutoff = now - p.windowDays * 86400_000
    return Date.parse(last) >= cutoff
  }
  if (!last) return true
  if (p.windowDays == null) return false
  const cutoff = now - p.windowDays * 86400_000
  return Date.parse(last) < cutoff
}

// ============================================================
// Lightweight evaluator for the serialized form shipped to SDKs
// (SerializedSegmentRules). SDKs evaluate this subset locally
// for instant trigger firing; the server is authoritative.
// ============================================================

export function evaluateSerializedSegmentRules(
  rules: SerializedSegmentRules | null | undefined,
  user: UserState,
): boolean {
  if (!rules) return true
  const { userProperties, eventCounts } = rules
  if (userProperties && userProperties.length > 0) {
    for (const rule of userProperties) {
      if (!evaluateUserPropertyRule(rule, user)) return false
    }
  }
  if (eventCounts && eventCounts.length > 0) {
    for (const rule of eventCounts) {
      if (!evaluateEventCountRule(rule, user)) return false
    }
  }
  return true
}

function evaluateUserPropertyRule(rule: UserPropertyRule, user: UserState): boolean {
  const actual = user.properties[rule.key]
  switch (rule.op) {
    case 'eq':
      return actual === rule.value
    case 'neq':
      return actual !== rule.value
    case 'in':
      return (
        Array.isArray(rule.value) &&
        actual != null &&
        (rule.value as ReadonlyArray<unknown>).includes(actual)
      )
    case 'gt':
      return (
        typeof actual === 'number' &&
        typeof rule.value === 'number' &&
        actual > rule.value
      )
    case 'gte':
      return (
        typeof actual === 'number' &&
        typeof rule.value === 'number' &&
        actual >= rule.value
      )
    case 'lt':
      return (
        typeof actual === 'number' &&
        typeof rule.value === 'number' &&
        actual < rule.value
      )
    case 'lte':
      return (
        typeof actual === 'number' &&
        typeof rule.value === 'number' &&
        actual <= rule.value
      )
  }
}

function evaluateEventCountRule(rule: EventCountRule, user: UserState): boolean {
  const bucket = user.eventCounts[rule.eventName]
  const count = bucket?.[rule.windowDays] ?? 0
  switch (rule.op) {
    case 'eq':
      return count === rule.count
    case 'gte':
      return count >= rule.count
    case 'lte':
      return count <= rule.count
  }
}
