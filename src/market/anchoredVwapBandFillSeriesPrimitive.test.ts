import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE } from './anchoredVwapDrawingInteraction.ts'
import {
  AnchoredVwapBandFillSeriesPrimitive,
  type AnchoredVwapDrawingPrimitiveContext,
} from './anchoredVwapDrawingSeriesPrimitive.ts'
import type { MarketCandle } from './types.ts'

function candle(
  time: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): MarketCandle {
  return { time, open: close, high, low, close, volume, interval: '1h' }
}

function makeChart() {
  return {
    timeScale: () => ({
      options: () => ({ barSpacing: 6 }),
      getVisibleLogicalRange: () => ({ from: 0, to: 10 }),
      timeToCoordinate: (time: number) => time,
      timeToIndex: () => null,
      logicalToCoordinate: () => null,
      coordinateToTime: () => null,
    }),
  }
}

function makeSeries() {
  return {
    priceToCoordinate: (price: number) => 100 - price,
    barsInLogicalRange: () => ({ from: 100 as never, to: 300 as never }),
  }
}

function makePrimitive(getContext: () => AnchoredVwapDrawingPrimitiveContext) {
  const primitive = new AnchoredVwapBandFillSeriesPrimitive(
    () => makeChart() as never,
    () => makeSeries() as never,
    getContext,
  )
  const view = primitive.paneViews()[0] as {
    zOrder: () => string
    renderer: () => unknown
  }
  return { primitive, view }
}

const CANDLES = [
  candle(100, 11, 9, 10, 100),
  candle(200, 13, 11, 12, 100),
  candle(300, 15, 13, 14, 100),
]

function baseContext(instances: AnchoredVwapDrawingPrimitiveContext['instances']) {
  return {
    instances,
    interaction: INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
    candles: CANDLES,
    intervalDurationSeconds: 0,
    lastBarUnixTime: null,
  } satisfies AnchoredVwapDrawingPrimitiveContext
}

describe('AnchoredVwapBandFillSeriesPrimitive', () => {
  it('renders a bottom pane view for a visible band pair', () => {
    const context = baseContext([createAnchoredVwapInstance({ anchorTime: 100 })!])
    const { primitive, view } = makePrimitive(() => context)
    primitive.updateAllViews()
    assert.equal(view.zOrder(), 'bottom')
    assert.notEqual(view.renderer(), null)
  })

  it('renders nothing when the instance is hidden', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    instance.hidden = true
    const context = baseContext([instance])
    const { primitive, view } = makePrimitive(() => context)
    primitive.updateAllViews()
    assert.equal(view.renderer(), null)
  })

  it('renders nothing when every band pair is hidden', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    instance.settings.band1.visible = false
    instance.settings.band2.visible = false
    instance.settings.band3.visible = false
    const context = baseContext([instance])
    const { primitive, view } = makePrimitive(() => context)
    primitive.updateAllViews()
    assert.equal(view.renderer(), null)
  })

  it('renders nothing when the visible pair has a zero multiplier', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    instance.settings.band1.multiplier = 0
    instance.settings.band2.visible = false
    instance.settings.band3.visible = false
    const context = baseContext([instance])
    const { primitive, view } = makePrimitive(() => context)
    primitive.updateAllViews()
    assert.equal(view.renderer(), null)
  })

  it('renders nothing without instances', () => {
    const context = baseContext([])
    const { primitive, view } = makePrimitive(() => context)
    primitive.updateAllViews()
    assert.equal(view.renderer(), null)
  })
})
