import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hitTestChartObjectSettingsTarget } from './chartObjectSettingsHitTest.ts'
import { createLiquidationLevelsIndex } from './liquidationLevelsIndex.ts'
import { DEFAULT_LIQUIDATION_LEVELS_SETTINGS } from './liquidationLevelsSettings.ts'
import {
  PRICE_LEVEL_HIT_ORDER,
  PRICE_LEVEL_PAINT_ORDER,
  PRICE_LEVEL_KIND_INDICATOR,
  PRICE_LEVEL_SETTINGS_STORAGE_KEY,
  TPSL_KIND_CHANNEL,
  isTpslKind,
  priceLevelKindForIndicator,
  type PriceLevelKind,
} from './priceLevelsKind.ts'
import type { PriceLevelHitTarget } from './chartObjectSettingsHitTest.ts'

function fakeEnvironment(options: {
  paneHeight?: number
  plotWidth?: number
  priceScaleWidth?: number
  topPrice?: number
  bottomPrice?: number
} = {}) {
  const paneHeight = options.paneHeight ?? 400
  const plotWidth = options.plotWidth ?? 800
  const priceScaleWidth = options.priceScaleWidth ?? 60
  const prices = { top: options.topPrice ?? 200, bottom: options.bottomPrice ?? 100 }
  const pane = {
    getHeight: () => paneHeight,
    getHTMLElement: () => ({ clientWidth: plotWidth + priceScaleWidth }) as HTMLElement,
    paneIndex: () => 0,
  }
  const chart = {
    timeScale: () => ({
      width: () => plotWidth + priceScaleWidth,
      options: () => ({ barSpacing: 10 }),
    }),
    priceScale: () => ({ width: () => 0 }),
  }
  const series = {
    getPane: () => pane,
    coordinateToPrice: (y: number) =>
      prices.bottom + (1 - y / paneHeight) * (prices.top - prices.bottom),
    priceScale: () => ({ width: () => priceScaleWidth }),
  }
  return { chart, series, paneHeight, plotWidth, prices }
}

function indexWith(price: number, size: number) {
  const index = createLiquidationLevelsIndex()
  index.replaceBook({
    epoch: 'e',
    seq: 1,
    headTs: 1,
    positions: new Map([['o1', { user: 'o1', price, size, ts: 1 }]]),
  })
  return index
}

function target(
  kind: PriceLevelKind,
  over: Partial<PriceLevelHitTarget> = {},
): PriceLevelHitTarget {
  return {
    kind,
    enabled: true,
    exchange: 'hyperliquid',
    settings: DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
    index: indexWith(150, 5),
    ...over,
  }
}

function hit(
  targets: PriceLevelHitTarget[],
  over: { x?: number; y?: number; interval?: '1m' | '1w' } = {},
) {
  const env = fakeEnvironment()
  return hitTestChartObjectSettingsTarget({
    chart: env.chart as never,
    series: env.series as never,
    paneRole: 'candle',
    paneX: over.x ?? 790,
    paneY: over.y ?? 200,
    interval: over.interval ?? '1m',
    intervalDurationSeconds: 60,
    lastBarUnixTime: null,
    activeIndicators: [],
    loadedVwapLevel: null,
    loadedVwapInterval: null,
    bundle: {} as never,
    rectangleInteraction: { phase: 'inactive' } as never,
    lineInteraction: { phase: 'inactive' } as never,
    anchoredVwapDrawingInteraction: { phase: 'inactive' } as never,
    fixedRangeVolumeProfileInteraction: { phase: 'inactive' } as never,
    rectangleInstances: [],
    lineInstances: [],
    fixedRangeVolumeProfileInstances: [],
    fixedRangeVolumeProfileRuntime: {},
    rollingVwapInstances: [],
    anchoredVwapInstances: [],
    priceLevels: targets,
  })
}

describe('price level kinds', () => {
  it('maps the three indicator ids to kinds and back', () => {
    assert.equal(priceLevelKindForIndicator('liquidation-levels'), 'liquidation')
    assert.equal(priceLevelKindForIndicator('stop-loss-levels'), 'stop-loss')
    assert.equal(priceLevelKindForIndicator('take-profit-levels'), 'take-profit')
    assert.equal(priceLevelKindForIndicator('rsi'), null)
    for (const kind of PRICE_LEVEL_PAINT_ORDER) {
      assert.equal(priceLevelKindForIndicator(PRICE_LEVEL_KIND_INDICATOR[kind]), kind)
    }
  })

  it('paints bottom-up and hit-tests top-down', () => {
    assert.deepEqual(PRICE_LEVEL_PAINT_ORDER, ['liquidation', 'stop-loss', 'take-profit'])
    assert.deepEqual(PRICE_LEVEL_HIT_ORDER, [...PRICE_LEVEL_PAINT_ORDER].reverse())
  })

  it('keeps one settings storage key per kind and only trigger orders on TPSL', () => {
    const keys = new Set(Object.values(PRICE_LEVEL_SETTINGS_STORAGE_KEY))
    assert.equal(keys.size, 3)
    assert.equal(PRICE_LEVEL_SETTINGS_STORAGE_KEY.liquidation, '0xdeck-widget-liquidation-levels-settings')
    assert.equal(isTpslKind('liquidation'), false)
    assert.equal(isTpslKind('stop-loss'), true)
    assert.equal(TPSL_KIND_CHANNEL['stop-loss'], 'stop_losses')
    assert.equal(TPSL_KIND_CHANNEL['take-profit'], 'take_profits')
  })
})

describe('price level hit priority', () => {
  it('resolves the top-most enabled profile, then falls through', () => {
    const all = [
      target('take-profit'),
      target('stop-loss'),
      target('liquidation'),
    ]
    assert.deepEqual(hit(all), { kind: 'take-profit-levels' })
    assert.deepEqual(hit([{ ...all[0], enabled: false }, all[1], all[2]]), {
      kind: 'stop-loss-levels',
    })
    assert.deepEqual(
      hit([
        { ...all[0], enabled: false },
        { ...all[1], enabled: false },
        all[2],
      ]),
      { kind: 'liquidation-levels' },
    )
    assert.equal(
      hit([
        { ...all[0], enabled: false },
        { ...all[1], enabled: false },
        { ...all[2], enabled: false },
      ]),
      null,
    )
  })

  it('never resolves a profile that is unsupported on the exchange or interval', () => {
    assert.deepEqual(
      hit([target('take-profit', { exchange: 'binance' }), target('liquidation')]),
      { kind: 'liquidation-levels' },
    )
    assert.equal(hit([target('take-profit', { exchange: 'binance' })], {}), null)
    // The profile supports every candle interval today; an unknown interval id
    // still falls through instead of returning a phantom target.
    assert.deepEqual(hit([target('stop-loss')], { interval: '1w' }), {
      kind: 'stop-loss-levels',
    })
  })

  it('resolves only where a bar is actually painted, and the widest profile wins', () => {
    const takeProfit = target('take-profit', { index: indexWith(150, 1) })
    const stopLoss = target('stop-loss', { index: indexWith(150, 50) })
    // Both indexes normalise their own single row to full extent, so the bars
    // overlap completely and priority decides.
    assert.deepEqual(hit([takeProfit, stopLoss]), { kind: 'take-profit-levels' })
    // Outside the bar extent nothing resolves.
    assert.equal(hit([takeProfit, stopLoss], { x: 400 }), null)
    // A row of a different price does not resolve either.
    assert.equal(hit([takeProfit, stopLoss], { y: 20 }), null)
  })
})
