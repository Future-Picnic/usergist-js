import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./UserGist.js', () => ({
  UserGist: {
    track: vi.fn(),
    _notifyPushEvent: vi.fn(),
  },
}))

import {
  Push,
  jsonActionForButton,
  parseFcmData,
  parseIosPayload,
} from './Push.js'

const actionJson = { type: 'enable_feature', feature: 'priority_checkout' }

afterEach(() => Push.setHandlers({}))

it('delivers a cold JSON open to late host handlers once without retracking it', async () => {
  vi.resetModules();vi.clearAllMocks()
  const {Push: cold} = await import('./Push.js')
  const {UserGist} = await import('./UserGist.js')
  const payload={usergist:{deliveryId:'late-host-json',openAction:{action:'json',actionJson:{type:'qa',id:'00123',amount:1234,optional:null,nested:{flag:false}}}}}
  cold.handleOpened({userInfo:payload})
  cold.handleOpened({userInfo:payload})
  const onOpen=vi.fn(),onJsonAction=vi.fn()
  cold.setHandlers({onOpen,onJsonAction})
  cold.setHandlers({onOpen,onJsonAction})
  expect(onOpen).toHaveBeenCalledOnce()
  expect(onJsonAction).toHaveBeenCalledOnce()
  expect(onJsonAction).toHaveBeenCalledWith(payload.usergist.openAction.actionJson,expect.objectContaining({source:'push',actionButton:'usergist_default'}))
  expect(UserGist.track).toHaveBeenCalledOnce()
})

it.each(['reset','revoked','expired'])('discards a queued cold callback after %s', async (reason) => {
  vi.resetModules();vi.clearAllMocks();vi.useFakeTimers()
  try {
    const {Push:cold,clearPendingPushCallbacks}=await import('./Push.js')
    let current=true
    cold.handleOpened({userInfo:{usergist:{deliveryId:'late-host-'+reason}},isCurrent:()=>current})
    if(reason==='reset')clearPendingPushCallbacks()
    if(reason==='revoked')current=false
    if(reason==='expired')vi.advanceTimersByTime(5*60_000)
    const onOpen=vi.fn()
    cold.setHandlers({onOpen})
    expect(onOpen).not.toHaveBeenCalled()
  }finally{vi.useRealTimers()}
})

describe('push JSON actions', () => {
  it('routes the default notification tap once with typed movie JSON', () => {
    const onJsonAction = vi.fn()
    const movie = {
      type: 'open_show',
      show_id: '00123',
      position_seconds: 1234,
    }
    Push.setHandlers({
      onOpen: () => {
        throw new Error('observer failed')
      },
      onJsonAction,
    })
    const payload = {
      aps: { alert: { title: 'Continue Midnight Orbit' } },
      usergist: {
        campaignId: 'movie-campaign',
        deliveryId: 'movie-default-tap',
        openAction: { action: 'json', actionJson: movie },
      },
    }
    Push.handleOpened({ userInfo: payload })
    Push.handleOpened({ userInfo: payload })
    expect(onJsonAction).toHaveBeenCalledOnce()
    expect(onJsonAction).toHaveBeenCalledWith(
      movie,
      expect.objectContaining({
        source: 'push',
        actionButton: 'usergist_default',
      }),
    )
    expect(
      parseFcmData({
        usergist_campaign_id: 'movie-campaign',
        usergist_open_action: JSON.stringify({
          action: 'json',
          actionJson: movie,
        }),
      })?.openAction?.actionJson,
    ).toEqual(movie)
  })
  it('parses action JSON from APNs and FCM payloads', () => {
    const buttons = [{ label: 'Enable', action: 'json' as const, actionJson }]
    expect(
      parseIosPayload({
        aps: { alert: { title: 'Title', body: 'Body' } },
        usergist: { campaignId: 'campaign', actionButtons: buttons },
      })?.actionButtons,
    ).toEqual(buttons)
    expect(
      parseFcmData({
        usergist_campaign_id: 'campaign',
        usergist_actions: JSON.stringify(buttons),
      })?.actionButtons,
    ).toEqual(buttons)
  })

  it('resolves stable action indexes and labels', () => {
    const buttons = [{ label: 'Enable', action: 'json' as const, actionJson }]
    expect(jsonActionForButton(buttons, 'usergist_action_0')).toEqual(
      actionJson,
    )
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
      expect.objectContaining({
        source: 'push',
        actionButton: 'usergist_action_0',
      }),
    )
    expect(order).toEqual(['tap', 'json'])
  })

  it('isolates host observers so they cannot block JSON execution', () => {
    const onJsonAction = vi.fn()
    Push.setHandlers({
      onAction: () => {
        throw new Error('host observer failed')
      },
      onJsonAction,
    })

    expect(() =>
      Push.handleOpened({
        data: {
          usergist_campaign_id: 'campaign',
          usergist_actions: JSON.stringify([
            { label: 'Enable', action: 'json', actionJson },
          ]),
        },
        actionIdentifier: 'usergist_action_0',
      }),
    ).not.toThrow()
    expect(onJsonAction).toHaveBeenCalledOnce()
  })
})
