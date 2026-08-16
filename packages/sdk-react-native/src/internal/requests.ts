// ============================================================
// requests cache — optimistic vote/follow with rollback
// ============================================================
// Holds an in-memory snapshot of recently-touched requests so the SDK
// can render counts immediately on tap, then reconcile against the
// server response. Spec §9 invariants enforced here:
//   - Upvoting auto-creates a follow (followerCount += 1 only if user
//     wasn't already following).
//   - Un-upvoting does NOT remove the follow.

import type { Request as RequestDto, RequestVote, RequestFollow } from '@usergist/sdk-core'

export interface RequestsCache {
  readonly upsert: (req: RequestDto) => void
  readonly upsertList: (requests: ReadonlyArray<RequestDto>) => void
  readonly get: (id: string) => RequestDto | undefined
  readonly applyOptimisticVote: (id: string, vote: boolean) => () => void
  readonly applyOptimisticFollow: (id: string, follow: boolean) => () => void
  readonly commitVote: (id: string, result: RequestVote) => void
  readonly commitFollow: (id: string, result: RequestFollow) => void
  readonly subscribe: (cb: (id: string, req: RequestDto) => void) => () => void
}

export function createRequestsCache(): RequestsCache {
  const map = new Map<string, RequestDto>()
  const listeners = new Set<(id: string, req: RequestDto) => void>()

  function notify(id: string, req: RequestDto): void {
    for (const cb of listeners) cb(id, req)
  }

  function snapshot(id: string): RequestDto | undefined {
    return map.get(id)
  }

  return {
    upsert(req) {
      map.set(req.id, req)
      notify(req.id, req)
    },
    upsertList(list) {
      for (const r of list) map.set(r.id, r)
    },
    get(id) {
      return map.get(id)
    },
    applyOptimisticVote(id, vote) {
      const before = snapshot(id)
      if (!before) return () => {}
      const upvoteDelta = vote && !before.viewerHasUpvoted ? 1 : !vote && before.viewerHasUpvoted ? -1 : 0
      // Auto-follow: upvoting bumps follower count if user wasn't following.
      const followDelta = vote && !before.viewerIsFollowing ? 1 : 0
      const next: RequestDto = {
        ...before,
        viewerHasUpvoted: vote,
        viewerIsFollowing: vote ? true : before.viewerIsFollowing,
        upvoteCount: Math.max(0, before.upvoteCount + upvoteDelta),
        followerCount: Math.max(0, before.followerCount + followDelta),
      }
      map.set(id, next)
      notify(id, next)
      return () => {
        map.set(id, before)
        notify(id, before)
      }
    },
    applyOptimisticFollow(id, follow) {
      const before = snapshot(id)
      if (!before) return () => {}
      const delta = follow && !before.viewerIsFollowing ? 1 : !follow && before.viewerIsFollowing ? -1 : 0
      const next: RequestDto = {
        ...before,
        viewerIsFollowing: follow,
        followerCount: Math.max(0, before.followerCount + delta),
      }
      map.set(id, next)
      notify(id, next)
      return () => {
        map.set(id, before)
        notify(id, before)
      }
    },
    commitVote(id, result) {
      const before = snapshot(id)
      if (!before) return
      const next: RequestDto = {
        ...before,
        viewerHasUpvoted: result.upvoted,
        viewerIsFollowing: result.followed,
        upvoteCount: result.upvoteCount,
        followerCount: result.followerCount,
      }
      map.set(id, next)
      notify(id, next)
    },
    commitFollow(id, result) {
      const before = snapshot(id)
      if (!before) return
      const next: RequestDto = {
        ...before,
        viewerIsFollowing: result.following,
        followerCount: result.followerCount,
      }
      map.set(id, next)
      notify(id, next)
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}

/**
 * Debounced search helper for SubmitRequestSheet's typeahead.
 * Cancels prior calls; only the latest result reaches subscribers.
 */
export function createDebouncedSearch<TResult>(
  fn: (q: string) => Promise<TResult>,
  delayMs = 300,
): {
  readonly query: (q: string) => void
  readonly subscribe: (cb: (q: string, r: TResult) => void) => () => void
  readonly cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSeq = 0
  const listeners = new Set<(q: string, r: TResult) => void>()

  return {
    query(q) {
      if (timer) clearTimeout(timer)
      const seq = ++lastSeq
      timer = setTimeout(() => {
        void (async () => {
          try {
            const r = await fn(q)
            if (seq === lastSeq) {
              for (const cb of listeners) cb(q, r)
            }
          } catch {
            // Swallow — typeahead errors don't surface; SubmitRequestSheet
            // simply renders nothing and lets the user "post anyway".
          }
        })()
      }, delayMs)
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    cancel() {
      if (timer) clearTimeout(timer)
      lastSeq++
    },
  }
}
