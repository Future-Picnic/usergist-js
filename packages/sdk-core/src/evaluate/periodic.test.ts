import {describe,it,expect} from 'vitest'
import {nextPeriodicFire} from './periodic.js'

describe('next periodic campaign occurrence',()=>{
 it.each([
  ['2026-11-10T12:00:00Z',15,'2026-11-15T09:00:00.000Z'],
  ['2026-11-15T08:59:00Z',15,'2026-11-15T09:00:00.000Z'],
  ['2026-11-15T09:00:00Z',15,'2026-12-15T09:00:00.000Z'],
  ['2026-01-31T10:00:00Z',31,'2026-02-28T09:00:00.000Z'],
  ['2028-02-01T10:00:00Z',31,'2028-02-29T09:00:00.000Z'],
 ])('uses the next monthly date from %s',(now,dayOfMonth,expected)=>{
  expect(nextPeriodicFire({frequency:'monthly',hourLocal:9,minuteLocal:0,dayOfMonth,tz:'UTC'},new Date(now)).toISOString()).toBe(expected)
 })
 it.each([
  ['2026-03-07T15:00:00Z','2026-03-08T13:00:00.000Z'],
  ['2026-10-31T15:00:00Z','2026-11-01T14:00:00.000Z'],
 ])('keeps the local daily hour across DST from %s',(now,expected)=>{
  expect(nextPeriodicFire({frequency:'daily',hourLocal:9,minuteLocal:0,tz:'America/New_York'},new Date(now)).toISOString()).toBe(expected)
 })
 it('skips a nonexistent spring-forward local time',()=>{
  expect(nextPeriodicFire({frequency:'daily',hourLocal:2,minuteLocal:30,tz:'America/New_York'},new Date('2026-03-07T12:00:00Z')).toISOString()).toBe('2026-03-09T06:30:00.000Z')
 })
 it('keeps the local weekly hour across DST',()=>{
  expect(nextPeriodicFire({frequency:'weekly',weekday:0,hourLocal:9,minuteLocal:0,tz:'America/New_York'},new Date('2026-03-07T15:00:00Z')).toISOString()).toBe('2026-03-08T13:00:00.000Z')
 })
})
