import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./UserGist.js', () => ({
  UserGist: {
    track: vi.fn(),
    _notifyPushEvent: vi.fn(),
  },
}))

import { Push, jsonActionForButton, parseFcmData, parseIosPayload } from './Push.js'

const actionJson = { type: 'enable_feature', feature: 'priority_checkout' }

afterEach(() => Push.setHandlers({}))

describe('push JSON actions', () => {
  it('parses action JSON from APNs and FCM payloads', () => {
    const buttons = [{ label: 'Enable', action: 'json' as const, actionJson }]
    expect(parseIosPayload({
      aps: { alert: { title: 'Title', body: 'Body' } },
      usergist: { campaignId: 'campaign', actionButtons: buttons },
    })?.actionButtons).toEqual(buttons)
    expect(parseFcmData({
      usergist_campaign_id: 'campaign',
      usergist_actions: JSON.stringify(buttons),
    })?.actionButtons).toEqual(buttons)
  })

  it('resolves stable action indexes and labels', () => {
    const buttons = [{ label: 'Enable', action: 'json' as const, actionJson }]
    expect(jsonActionForButton(buttons, 'usergist_action_0')).toEqual(actionJson)
    expect(jsonActionForButton(buttons, 'Enable')).toEqual(actionJson)
  })

  it('dispatches JSON only after reporting the generic action tap', () => {
    const order: string[] = []
    const onAction = vi.fn(() => order.push('tap'))
    const onJsonAction = vi.fn(() => order.push('json'))
    Push.setHandlers({ onAction, onJsonAction })

    Push.handleOpened({
      data: {
        usergist_campaign_id: 'campaign',
        usergist_actions: JSON.stringify([
          { label: 'Enable', action: 'json', actionJson },
        ]),
      },
      actionIdentifier: 'usergist_action_0',
    })

    expect(onAction).toHaveBeenCalledOnce()
    expect(onJsonAction).toHaveBeenCalledWith(
      actionJson,
      expect.objectContaining({ source: 'push', actionButton: 'usergist_action_0' }),
    )
    expect(order).toEqual(['tap', 'json'])
  })

  it('isolates host observers so they cannot block JSON execution', () => {
    const onJsonAction = vi.fn()
    Push.setHandlers({
      onAction: () => { throw new Error('host observer failed') },
      onJsonAction,
    })

    expect(() => Push.handleOpened({
      data: {
        usergist_campaign_id: 'campaign',
        usergist_actions: JSON.stringify([
          { label: 'Enable', action: 'json', actionJson },
        ]),
      },
      actionIdentifier: 'usergist_action_0',
    })).not.toThrow()
    expect(onJsonAction).toHaveBeenCalledOnce()
  })
})
