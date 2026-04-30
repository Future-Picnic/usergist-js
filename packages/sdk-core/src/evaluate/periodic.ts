import type { PeriodicFrequency } from '../types/campaign.js'

export interface PeriodicSchedule {
  readonly frequency: PeriodicFrequency
  readonly hourLocal: number
  readonly minuteLocal: number
  /** 0..6 (Sun=0). Required for `weekly`. */
  readonly weekday?: number
  /** 1..31. Required for `monthly`. */
  readonly dayOfMonth?: number
  /** IANA timezone the hour/minute are expressed in. Defaults to UTC. */
  readonly tz?: string
}

/**
 * Returns the next firing instant (as a Date in UTC) for a structured
 * periodic schedule, strictly after `now`.
 *
 * Pure / dependency-free. Used both server-side (push-scheduler `isDue`
 * check) and client-side (dashboard "Next occurrence" preview). Keep
 * deterministic for a given (schedule, now) tuple — no randomness.
 *
 * The walk is bounded — daily 2 iters, weekly 8, monthly 13 — so DST
 * gaps and short-month overflows can't loop forever.
 */
export function nextPeriodicFire(
  schedule: PeriodicSchedule,
  now: Date = new Date(),
): Date {
  const tz = schedule.tz || 'UTC'
  const start = startCandidate(schedule, now, tz)
  return walkForward(start, schedule, now, tz)
}

/**
 * Minutes east of UTC for `tz` at instant `at`. Falls back to 0 (UTC)
 * for invalid input. Exported so server-side callers can share the
 * same offset math the periodic walker uses (avoids a separate
 * implementation in push-scheduler.ts).
 */
export function tzOffsetMinutes(at: Date, tz: string): number {
  if (tz === 'UTC') return 0
  try {
    const fmt = getFormatter(tz)
    const parts = fmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value
      return acc
    }, {})
    const utc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) === 24 ? 0 : Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    return Math.round((utc - at.getTime()) / 60_000)
  } catch {
    return 0
  }
}

function startCandidate(
  schedule: PeriodicSchedule,
  now: Date,
  tz: string,
): Date {
  const localNow = wallClock(now, tz)
  const target = new Date(localNow)
  target.setHours(schedule.hourLocal, schedule.minuteLocal, 0, 0)
  return localToUtc(target, tz)
}

function walkForward(
  candidate: Date,
  schedule: PeriodicSchedule,
  now: Date,
  tz: string,
): Date {
  let cursor = candidate
  const max = schedule.frequency === 'daily' ? 2 : schedule.frequency === 'weekly' ? 8 : 13
  for (let i = 0; i < max; i++) {
    const local = wallClock(cursor, tz)
    if (matchesFrequency(local, schedule) && cursor.getTime() > now.getTime()) {
      return cursor
    }
    cursor = step(cursor, local, schedule, tz)
  }
  return cursor
}

function matchesFrequency(local: Date, schedule: PeriodicSchedule): boolean {
  if (schedule.frequency === 'daily') return true
  if (schedule.frequency === 'weekly') {
    return schedule.weekday === undefined || local.getDay() === schedule.weekday
  }
  return schedule.dayOfMonth === undefined || local.getDate() === schedule.dayOfMonth
}

function step(
  cursor: Date,
  cursorLocal: Date,
  schedule: PeriodicSchedule,
  tz: string,
): Date {
  if (schedule.frequency === 'daily' || schedule.frequency === 'weekly') {
    return addDays(cursor, 1)
  }
  // Monthly: jump to the next month at the same dayOfMonth (or last day if shorter).
  const next = new Date(cursorLocal)
  next.setMonth(next.getMonth() + 1)
  if (schedule.dayOfMonth !== undefined) {
    const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth())
    next.setDate(Math.min(schedule.dayOfMonth, lastDay))
  }
  next.setHours(schedule.hourLocal, schedule.minuteLocal, 0, 0)
  return localToUtc(next, tz)
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime())
  next.setDate(next.getDate() + days)
  return next
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/** Returns the Date adjusted so its `getX()` methods read in `tz`'s wall clock. */
function wallClock(d: Date, tz: string): Date {
  const offsetMin = tzOffsetMinutes(d, tz)
  return new Date(d.getTime() + offsetMin * 60_000)
}

/** Inverse of `wallClock` — given a Date whose getX reads in `tz`, return UTC. */
function localToUtc(localView: Date, tz: string): Date {
  const offsetMin = tzOffsetMinutes(localView, tz)
  return new Date(localView.getTime() - offsetMin * 60_000)
}

// `Intl.DateTimeFormat` construction dominates this module's cost (~100 µs
// per ctor). The scheduler can call `nextPeriodicFire` thousands of times
// per tick across many users, so we cache one formatter per tz at module
// scope. Map is keyed by IANA name and lookups are O(1). Safe to share —
// formatter instances are stateless across calls.
const FORMATTER_CACHE = /* @__PURE__ */ new Map<string, Intl.DateTimeFormat>()

function getFormatter(tz: string): Intl.DateTimeFormat {
  const cached = FORMATTER_CACHE.get(tz)
  if (cached) return cached
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  FORMATTER_CACHE.set(tz, fmt)
  return fmt
}
