import { describe, expect, it } from 'vitest'
import { validateIdentifyTransition } from './identity.js'

describe('identify transition contract', () => {
  it('allows an anonymous installation to identify', () => {
    expect(validateIdentifyTransition(null, null, 'account-1')).toBe('allowed')
  })

  it('treats the same stable account ID as already synchronized', () => {
    expect(validateIdentifyTransition('account-1', null, 'account-1')).toBe('already_identified')
  })

  it('requires reset before switching an active identified account', () => {
    expect(validateIdentifyTransition('account-1', null, 'account-2')).toBe('reset_required')
  })

  it('requires reset before replacing a different queued identity', () => {
    expect(validateIdentifyTransition(null, 'account-1', 'account-2')).toBe('reset_required')
  })
})

