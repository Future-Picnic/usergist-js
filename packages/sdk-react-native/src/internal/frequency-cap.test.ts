import {randomUUID} from 'node:crypto'
import {afterEach, expect, it, vi} from 'vitest'
import {createFrequencyCapManager} from './frequency-cap.js'
import {createStorageScope} from './storage.js'

const base=Date.parse('2026-01-01T00:00:00Z'),day=86400000
afterEach(()=>vi.useRealTimers())

it.each(['perPromptDays','perUserDays'] as const)('expires %s exactly at its boundary after storage reload',async tier=>{
  vi.useFakeTimers();vi.setSystemTime(base)
  const key='frequency-clock-'+randomUUID()
  const first=createFrequencyCapManager(createStorageScope(key))
  await first.hydrate();first.recordShown('one',base)
  await vi.advanceTimersByTimeAsync(200)
  const reopened=createFrequencyCapManager(createStorageScope(key))
  await reopened.hydrate()
  for(const delta of [-1,0,1]){
    vi.setSystemTime(base+day+delta)
    expect(reopened.canShow('one',{[tier]:1}).ok).toBe(delta>=0)
  }
})

it('isolates prompt and user windows, honors zero/omitted and uses the strictest window',async()=>{
  vi.useFakeTimers();vi.setSystemTime(base)
  const caps=createFrequencyCapManager(createStorageScope('frequency-clock-'+randomUUID()))
  await caps.hydrate();caps.recordShown('one',base)
  expect(caps.canShow('two',{perPromptDays:1}).ok).toBe(true)
  expect(caps.canShow('two',{perUserDays:1}).ok).toBe(false)
  expect(caps.canShow('one',{}).ok).toBe(true)
  expect(caps.canShow('one',{perPromptDays:0,perUserDays:0}).ok).toBe(true)
  const other=createFrequencyCapManager(createStorageScope('frequency-clock-'+randomUUID()))
  await other.hydrate()
  expect(other.canShow('one',{perPromptDays:1,perUserDays:1}).ok).toBe(true)
  vi.setSystemTime(base+day+1)
  expect(caps.canShow('one',{perPromptDays:2,perUserDays:1}).ok).toBe(false)
  vi.setSystemTime(base+2*day)
  expect(caps.canShow('one',{perPromptDays:2,perUserDays:1}).ok).toBe(true)
})
