import { describe, expect, it } from 'vitest'
import {
  isValidIanaTimeZone,
  zonedDateEndToUtc,
  zonedDateTimeParts,
  zonedDateTimeToUtc,
} from './timezone.js'
import { nextPeriodicFire } from './evaluate/periodic.js'

describe('timezone utilities', () => {
  it('validates IANA timezone identifiers', () => {
    expect(isValidIanaTimeZone('Asia/Jerusalem')).toBe(true)
    expect(isValidIanaTimeZone('America/New_York')).toBe(true)
    expect(isValidIanaTimeZone('UTC')).toBe(true)
    expect(isValidIanaTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidIanaTimeZone('')).toBe(false)
  })

  it('converts standard and daylight-saving wall-clock times', () => {
    expect(
      zonedDateTimeToUtc('2026-01-15', '09:30', 'Asia/Jerusalem').toISOString(),
    ).toBe('2026-01-15T07:30:00.000Z')
    expect(
      zonedDateTimeToUtc('2026-07-15', '09:30', 'Asia/Jerusalem').toISOString(),
    ).toBe('2026-07-15T06:30:00.000Z')
  })

  it('rejects nonexistent local times during the spring DST transition', () => {
    expect(() =>
      zonedDateTimeToUtc('2026-03-27', '02:30', 'Asia/Jerusalem'),
    ).toThrow(/does not exist/)
  })

  it('resolves ambiguous fall-back times to the earlier instant', () => {
    expect(
      zonedDateTimeToUtc('2026-10-25', '01:30', 'Europe/London').toISOString(),
    ).toBe('2026-10-25T00:30:00.000Z')
  })

  it('round-trips an instant through a named timezone', () => {
    expect(
      zonedDateTimeParts(new Date('2026-07-15T06:30:00.000Z'), 'Asia/Jerusalem'),
    ).toEqual({
      date: '2026-07-15',
      time: '09:30',
      weekday: 3,
      dayOfMonth: 15,
    })
  })

  it('computes periodic occurrences independently of the host timezone', () => {
    const originalTimezone = process.env.TZ
    try {
      for (const hostTimezone of ['UTC', 'America/New_York', 'Asia/Jerusalem']) {
        process.env.TZ = hostTimezone
        expect(
          nextPeriodicFire(
            {
              frequency: 'daily',
              hourLocal: 9,
              minuteLocal: 0,
              tz: 'Asia/Jerusalem',
            },
            new Date('2026-07-15T05:00:00.000Z'),
          ).toISOString(),
        ).toBe('2026-07-15T06:00:00.000Z')
      }
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimezone
    }
  })

  it('keeps the final 23:59 occurrence inside a campaign end date', () => {
    const finalOccurrence = zonedDateTimeToUtc(
      '2026-07-15',
      '23:59',
      'Asia/Jerusalem',
    )
    const endAt = zonedDateEndToUtc('2026-07-15', 'Asia/Jerusalem')

    expect(endAt.toISOString()).toBe('2026-07-15T20:59:59.999Z')
    expect(finalOccurrence.getTime()).toBeLessThan(endAt.getTime())
  })
})
