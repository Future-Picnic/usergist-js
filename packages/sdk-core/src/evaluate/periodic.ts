import type { PeriodicFrequency } from '../types/campaign.js'
import { zonedDateTimeParts, zonedDateTimeToUtc } from '../timezone.js'

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
 * The calendar walk is bounded. Missing spring-forward times are skipped;
 * repeated fall-back times use the earlier instant, and short months clamp
 * the selected day to their final date.
 */
export function nextPeriodicFire(
  schedule: PeriodicSchedule,
  now: Date = new Date(),
): Date {
  const tz = schedule.tz || 'UTC'
  const local = zonedDateTimeParts(now, tz)
  const cursor = new Date(local.date + 'T00:00:00.000Z')
  const requestedDay = schedule.dayOfMonth ?? cursor.getUTCDate()
  const time = String(schedule.hourLocal).padStart(2, '0') + ':' +
    String(schedule.minuteLocal).padStart(2, '0')
  // Walk calendar dates, not fixed 24-hour instants. Offset changes must
  // preserve the selected local hour. Monthly dates clamp to short months.
  const limit = schedule.frequency === 'daily' ? 3 : 15
  for (let i = 0; i < limit; i++) {
    if (schedule.frequency === 'monthly') {
      cursor.setUTCDate(Math.min(requestedDay,
        lastDayOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth())))
    }
    if (schedule.frequency !== 'weekly' || schedule.weekday === undefined ||
        cursor.getUTCDay() === schedule.weekday) {
      try {
        const candidate = zonedDateTimeToUtc(cursor.toISOString().slice(0, 10), time, tz)
        if (candidate.getTime() > now.getTime()) return candidate
      } catch (error) {
        // A recurring occurrence in a spring-forward gap is skipped. Never
        // silently move it to a different local hour or emit it twice in a fold.
        if (!(error instanceof RangeError) || !error.message.includes('does not exist')) throw error
      }
    }
    if (schedule.frequency === 'monthly') {
      cursor.setUTCDate(1)
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    } else cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  throw new RangeError('No next periodic occurrence within the calendar search window')
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

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
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
