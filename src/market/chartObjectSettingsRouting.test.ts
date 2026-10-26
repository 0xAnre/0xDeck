import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chartObjectSettingsTargetKey } from './chartObjectSettingsTypes.ts'
import { chartObjectSettingsTargetForPaneRole } from './chartObjectSettingsHitTest.ts'
import { pointerMovementWithinClickTolerance } from './chartObjectState.ts'
import {
  createLineInstance,
  isLineInstanceHidden,
  setLineInstanceHidden,
} from './lineInstances.ts'
import {
  createRectangleInstance,
  setRectangleInstanceHidden,
} from './rectangleInstances.ts'

describe('chart object settings routing', () => {
  it('builds stable settings target keys', () => {
    assert.equal(chartObjectSettingsTargetKey({ kind: 'line', instanceId: 'line-1' }), 'line:line-1')
    assert.equal(
      chartObjectSettingsTargetKey({ kind: 'market-indicator', indicatorId: 'dual-ema' }),
      'market-indicator:dual-ema',
    )
    assert.equal(
      chartObjectSettingsTargetKey({ kind: 'market-indicator', indicatorId: 'rsi' }),
      'market-indicator:rsi',
    )
    assert.equal(
      chartObjectSettingsTargetKey({ kind: 'aggregated-liquidations' }),
      'aggregated-liquidations',
    )
  })

  it('routes the RSI pane to the RSI indicator dialog', () => {
    assert.deepEqual(chartObjectSettingsTargetForPaneRole('rsi', ['rsi']), {
      kind: 'market-indicator',
      indicatorId: 'rsi',
    })
    assert.equal(chartObjectSettingsTargetForPaneRole('rsi', []), null)
  })

  it('routes the liquidation pane to its panel-scoped settings dialog', () => {
    assert.deepEqual(
      chartObjectSettingsTargetForPaneRole('aggregated-liquidations', ['aggregated-liquidations']),
      { kind: 'aggregated-liquidations' },
    )
    assert.equal(chartObjectSettingsTargetForPaneRole('aggregated-liquidations', []), null)
  })

  it('keeps the candle pane on the drawing/series hit test path', () => {
    assert.equal(
      chartObjectSettingsTargetForPaneRole('candle', ['rsi', 'aggregated-liquidations']),
      null,
    )
    assert.equal(chartObjectSettingsTargetForPaneRole(null, ['rsi']), null)
  })

  it('treats pointer movement within tolerance as a click', () => {
    assert.equal(pointerMovementWithinClickTolerance(0, 0, 2, 2), true)
    assert.equal(pointerMovementWithinClickTolerance(0, 0, 10, 0), false)
  })
})

describe('chart object visibility', () => {
  it('persists hidden flag on line and rectangle instances', () => {
    const line = createLineInstance({
      timeA: 100,
      priceA: 1,
      timeB: 200,
      priceB: 2,
    })!
    const hiddenLine = setLineInstanceHidden(line, true)
    assert.equal(isLineInstanceHidden(hiddenLine), true)

    const box = createRectangleInstance({
      fromTime: 100,
      toTime: 200,
      lowPrice: 1,
      highPrice: 2,
    })!
    const hiddenBox = setRectangleInstanceHidden(box, true)
    assert.equal(hiddenBox.hidden, true)
  })
})
