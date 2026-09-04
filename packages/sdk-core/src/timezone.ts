const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

export interface ZonedDateTimeParts {
  readonly date: string
  readonly time: string
  readonly weekday: number
  readonly dayOfMonth: number
}

export function isValidIanaTimeZone(value: string): boolean {
  if (!value.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function zonedDateTimeParts(
  instant: Date,
  timeZone: string,
): ZonedDateTimeParts {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`)
  }
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError('Invalid date')
  }

  const formatter = getPartsFormatter(timeZone)
  const parts = formatter.formatToParts(instant).reduce<Record<string, string>>(
    (result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value
      return result
    },
    {},
  )
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)

  return {
    date: `${year}-${pad2(month)}-${pad2(day)}`,
    time: `${pad2(hour)}:${pad2(minute)}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    dayOfMonth: day,
  }
}

/**
 * Converts an IANA-zone wall-clock value into an absolute instant.
 *
 * Ambiguous fall-back times resolve to the earlier occurrence. Nonexistent
 * spring-forward times are rejected instead of silently moving a campaign.
 */
export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`)
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) throw new RangeError('Invalid local date or time')

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const calendarCheck = new Date(naive)
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    throw new RangeError('Invalid local date or time')
  }

  // A wall-clock value can have zero, one, or two matching instants around a
  // timezone transition. Sample both sides of the local date so we observe
  // every applicable offset, then retain only exact round trips.
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) =>
      timeZoneOffsetMinutes(new Date(naive + hours * 3_600_000), timeZone),
    ),
  )
  const candidates = [...offsets]
    .map((offset) => new Date(naive - offset * 60_000))
    .filter((candidate) => {
      const roundTrip = zonedDateTimeParts(candidate, timeZone)
      return roundTrip.date === date && roundTrip.time === time
    })
    .sort((left, right) => left.getTime() - right.getTime())

  const candidate = candidates[0]
  if (!candidate) {
    throw new RangeError('This local time does not exist in the selected timezone')
  }
  return candidate
}

/** Returns the final millisecond of a calendar date in an IANA timezone. */
export function zonedDateEndToUtc(date: string, timeZone: string): Date {
  const lastMinute = zonedDateTimeToUtc(date, '23:59', timeZone)
  return new Date(lastMinute.getTime() + 59_999)
}

function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = getPartsFormatter(timeZone)
    .formatToParts(instant)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value
      return result
    }, {})
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = PARTS_FORMATTER_CACHE.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  PARTS_FORMATTER_CACHE.set(timeZone, formatter)
  return formatter
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
