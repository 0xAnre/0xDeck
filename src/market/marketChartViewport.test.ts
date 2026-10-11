import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS,
  MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
  MARKET_CHART_INITIAL_VISIBLE_BARS,
  applyDefaultMarketChartPresentation,
  parsePersistedMarketChartViewport,
  restoreMarketChartViewport,
} from './marketChartViewport.ts'

function makeChartStub() {
  let logicalRange: { from: number; to: number } | null = null
  let rightOffset = 0
  let autoScale = true
  let scaleMargins = { top: 0.2, bottom: 0.1 }
  let priceVisible: { from: number; to: number } | null = null

  const chart = {
    timeScale: () => ({
      applyOptions: (options: { rightOffset?: number }) => {
        if (options.rightOffset !== undefined) rightOffset = options.rightOffset
      },
      options: () => ({ rightOffset }),
      setVisibleLogicalRange: (range: { from: number; to: number }) => {
        logicalRange = range
      },
      getVisibleLogicalRange: () => logicalRange,
    }),
    priceScale: () => ({
      applyOptions: (options: {
        scaleMargins?: { top: number; bottom: number }
      }) => {
        if (options.scaleMargins) scaleMargins = options.scaleMargins
      },
      options: () => ({ autoScale, scaleMargins }),
      setAutoScale: (on: boolean) => {
        autoScale = on
      },
      setVisibleRange: (range: { from: number; to: number }) => {
        priceVisible = range
      },
      getVisibleRange: () => priceVisible,
    }),
  }

  return {
    chart,
    getState: () => ({ logicalRange, rightOffset, autoScale, scaleMargins, priceVisible }),
  }
}

describe('parsePersistedMarketChartViewport', () => {
  const valid = {
    version: 1,
    logicalRange: { from: 10, to: 20 },
    autoScale: true,
    priceRange: null,
    scaleMargins: { top: 0.1, bottom: 0.1 },
    rightOffset: 8,
  }

  it('accepts a valid autoscale viewport', () => {
    assert.deepEqual(parsePersistedMarketChartViewport(valid), valid)
  })

  it('rejects invalid logical range and margins', () => {
    assert.equal(parsePersistedMarketChartViewport(null), null)
    assert.equal(
      parsePersistedMarketChartViewport({ ...valid, logicalRange: { from: 5, to: 5 } }),
      null,
    )
    assert.equal(
      parsePersistedMarketChartViewport({ ...valid, scaleMargins: { top: 0.9, bottom: 0.2 } }),
      null,
    )
    assert.equal(
      parsePersistedMarketChartViewport({ ...valid, autoScale: false, priceRange: null }),
      null,
    )
  })
})

describe('applyDefaultMarketChartPresentation', () => {
  it('applies margins, right offset, and last visible bars', () => {
    const { chart, getState } = makeChartStub()
    applyDefaultMarketChartPresentation(chart as never, 1000)
    const state = getState()
    assert.deepEqual(state.scaleMargins, MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS)
    assert.equal(state.rightOffset, MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET)
    assert.equal(state.logicalRange?.from, 1000 - MARKET_CHART_INITIAL_VISIBLE_BARS)
    assert.equal(state.logicalRange?.to, 999)
  })

  it('shows full range when fewer than visible bars exist', () => {
    const { chart, getState } = makeChartStub()
    applyDefaultMarketChartPresentation(chart as never, 100)
    assert.deepEqual(getState().logicalRange, { from: 0, to: 99 })
  })
})

describe('restoreMarketChartViewport', () => {
  it('restores saved ranges when plausible', () => {
    const { chart, getState } = makeChartStub()
    const saved = {
      version: 1 as const,
      logicalRange: { from: 50, to: 150 },
      autoScale: false,
      priceRange: { from: 90_000, to: 92_000 },
      scaleMargins: { top: 0.05, bottom: 0.15 },
      rightOffset: 4,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, 500), true)
    const state = getState()
    assert.deepEqual(state.logicalRange, saved.logicalRange)
    assert.equal(state.autoScale, false)
    assert.deepEqual(state.priceVisible, saved.priceRange)
    assert.equal(state.rightOffset, 4)
  })

  it('falls back when logical range is implausible', () => {
    const { chart, getState } = makeChartStub()
    const saved = {
      version: 1 as const,
      logicalRange: { from: 10_000, to: 10_100 },
      autoScale: true,
      priceRange: null,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      rightOffset: 8,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, 200), false)
    assert.equal(getState().logicalRange, null)
  })
})
