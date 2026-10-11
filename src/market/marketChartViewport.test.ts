import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS,
  MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
  MARKET_CHART_INITIAL_VISIBLE_BARS,
  applyDefaultMarketChartPresentation,
  parsePersistedMarketChartViewport,
  restoreMarketChartViewport,
  savedVisibleTimeRangeIsRestorable,
  visibleTimeRangeNeedsHistoryLoad,
  visibleTimeRangeNeedsOlderHistory,
  visibleTimeRangeOverlapsLoadedCandles,
  visibleTimeRangeToLogicalRange,
} from './marketChartViewport.ts'
import type { MarketCandle } from './types.ts'

function makeChartStub(candleTimes: number[] = [], barDurationSeconds = 60) {
  let logicalRange: { from: number; to: number } | null = null
  let visibleTimeRange: { from: number; to: number } | null = null
  let rightOffset = 0
  let scrollPosition = 0
  let autoScale = true
  let scaleMargins = { top: 0.2, bottom: 0.1 }
  let priceVisible: { from: number; to: number } | null = null

  const timeAtLogical = (index: number): number => {
    if (candleTimes.length > 0) {
      const clamped = Math.max(0, Math.min(candleTimes.length - 1, Math.round(index)))
      return candleTimes[clamped]
    }
    return index * barDurationSeconds
  }

  const chart = {
    timeScale: () => ({
      applyOptions: (options: { rightOffset?: number }) => {
        if (options.rightOffset === undefined) return
        rightOffset = options.rightOffset
      },
      options: () => ({ rightOffset }),
      scrollPosition: () => scrollPosition,
      scrollToPosition: (position: number) => {
        scrollPosition = position
      },
      setVisibleLogicalRange: (range: { from: number; to: number }) => {
        logicalRange = range
        visibleTimeRange = {
          from: timeAtLogical(range.from),
          to: timeAtLogical(range.to),
        }
      },
      getVisibleLogicalRange: () => logicalRange,
      setVisibleRange: (range: { from: number; to: number }) => {
        visibleTimeRange = { ...range }
        logicalRange = null
        scrollPosition = 0
      },
      getVisibleRange: () => visibleTimeRange,
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
    getState: () => ({
      logicalRange,
      visibleTimeRange,
      rightOffset,
      scrollPosition,
      autoScale,
      scaleMargins,
      priceVisible,
    }),
    setScrollPosition: (position: number) => {
      scrollPosition = position
    },
  }
}

const sampleCandles = (times: number[]): MarketCandle[] =>
  times.map((time) => ({
    time,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 1,
    interval: '1m',
  }))

describe('parsePersistedMarketChartViewport', () => {
  const valid = {
    version: 1,
    visibleLogicalRange: { from: 12, to: 28 },
    visibleTimeRange: { from: 1_700_000_000, to: 1_700_010_000 },
    autoScale: true,
    priceRange: null,
    scaleMargins: { top: 0.1, bottom: 0.1 },
    rightOffset: 8,
  }

  it('accepts a valid autoscale viewport', () => {
    assert.deepEqual(parsePersistedMarketChartViewport(valid), valid)
  })

  it('accepts negative scroll position from historical panning', () => {
    const historical = { ...valid, rightOffset: -12 }
    assert.deepEqual(parsePersistedMarketChartViewport(historical), historical)
  })

  it('rejects invalid time range and margins', () => {
    assert.equal(parsePersistedMarketChartViewport(null), null)
    assert.equal(
      parsePersistedMarketChartViewport({ ...valid, visibleTimeRange: { from: 5, to: 5 } }),
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
    assert.equal(
      parsePersistedMarketChartViewport({
        ...valid,
        visibleTimeRange: { from: 1_700_000_000, to: 1_700_000_000 },
      }),
      null,
    )
  })

  it('accepts negative scroll positions from historical panning', () => {
    const withNegativeScroll = { ...valid, rightOffset: -12 }
    assert.deepEqual(parsePersistedMarketChartViewport(withNegativeScroll), withNegativeScroll)
  })
})

describe('applyDefaultMarketChartPresentation', () => {
  it('applies margins, initial range, then right offset', () => {
    const { chart, getState } = makeChartStub()
    applyDefaultMarketChartPresentation(chart as never, 1000)
    const state = getState()
    assert.deepEqual(state.scaleMargins, MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS)
    assert.equal(state.scrollPosition, MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET)
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
  const candles = sampleCandles([1_700_000_000, 1_700_000_060, 1_700_000_120])

  it('restores saved ranges when data covers the window', () => {
    const times = candles.map((c) => c.time)
    const { chart, getState } = makeChartStub(times)
    const saved = {
      version: 1 as const,
      visibleLogicalRange: { from: 0, to: 2.5 },
      visibleTimeRange: { from: 1_700_000_000, to: 1_700_000_120 },
      autoScale: false,
      priceRange: { from: 90_000, to: 92_000 },
      scaleMargins: { top: 0.05, bottom: 0.15 },
      rightOffset: 4,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'restored')
    const state = getState()
    assert.equal(state.autoScale, false)
    assert.deepEqual(state.priceVisible, saved.priceRange)
    assert.equal(state.scrollPosition, 0)
    assert.deepEqual(state.logicalRange, saved.visibleLogicalRange)
  })

  it('requests older history when the saved window starts before loaded candles', () => {
    const { chart, getState } = makeChartStub()
    const saved = {
      version: 1 as const,
      visibleLogicalRange: { from: -5, to: 2 },
      visibleTimeRange: { from: 1_699_999_000, to: 1_700_000_120 },
      autoScale: true,
      priceRange: null,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      rightOffset: 8,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'needs_history')
    assert.equal(getState().visibleTimeRange, null)
    assert.equal(getState().rightOffset, 0)
  })

  it('requests older history when the saved window is entirely before loaded candles', () => {
    const { chart, getState } = makeChartStub()
    const saved = {
      version: 1 as const,
      visibleLogicalRange: { from: -20, to: -10 },
      visibleTimeRange: { from: 1_699_998_000, to: 1_699_999_500 },
      autoScale: true,
      priceRange: null,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      rightOffset: 8,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'needs_history')
    assert.deepEqual(getState().scaleMargins, saved.scaleMargins)
    assert.equal(getState().visibleTimeRange, null)
  })

  it('falls back when the saved window is entirely after loaded candles', () => {
    const { chart, getState } = makeChartStub()
    const saved = {
      version: 1 as const,
      visibleLogicalRange: { from: 50, to: 60 },
      visibleTimeRange: { from: 1_800_000_000, to: 1_800_010_000 },
      autoScale: true,
      priceRange: null,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      rightOffset: 8,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'invalid')
    assert.equal(getState().visibleTimeRange, null)
  })

  it('restores saved logical range including right-edge whitespace', () => {
    const times = candles.map((c) => c.time)
    const { chart, getState } = makeChartStub(times)
    const saved = {
      version: 1 as const,
      visibleLogicalRange: { from: 0, to: 10 },
      visibleTimeRange: { from: 1_700_000_000, to: 1_700_000_120 },
      autoScale: true,
      priceRange: null,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      rightOffset: 8,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'restored')
    assert.deepEqual(getState().logicalRange, saved.visibleLogicalRange)
    assert.equal(getState().scrollPosition, 0)
  })

  it('preserves logical width across repeated restore cycles', () => {
    const times = candles.map((c) => c.time)
    const { chart, getState } = makeChartStub(times)
    const saved = {
      version: 1 as const,
      visibleLogicalRange: { from: 0, to: 10 },
      visibleTimeRange: { from: 1_700_000_000, to: 1_700_000_120 },
      autoScale: true,
      priceRange: null,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      rightOffset: 8,
    }
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'restored')
    const first = getState()
    assert.equal(restoreMarketChartViewport(chart as never, saved, candles), 'restored')
    const second = getState()
    assert.deepEqual(second.logicalRange, first.logicalRange)
    assert.equal(second.scrollPosition, first.scrollPosition)
  })
})

describe('visibleTimeRangeToLogicalRange', () => {
  const candles = sampleCandles([100, 200, 300, 400])

  it('maps saved timestamps to candle indices', () => {
    assert.deepEqual(visibleTimeRangeToLogicalRange(candles, { from: 100, to: 300 }), {
      from: 0,
      to: 2,
    })
  })
})

describe('visibleTimeRange helpers', () => {
  const candles = sampleCandles([100, 200, 300])

  it('detects overlap and older-history needs', () => {
    assert.equal(
      visibleTimeRangeOverlapsLoadedCandles({ from: 150, to: 250 }, candles),
      true,
    )
    assert.equal(
      visibleTimeRangeNeedsOlderHistory({ from: 50, to: 250 }, candles),
      true,
    )
    assert.equal(
      visibleTimeRangeOverlapsLoadedCandles({ from: 400, to: 500 }, candles),
      false,
    )
    assert.equal(visibleTimeRangeNeedsHistoryLoad({ from: 50, to: 150 }, candles), true)
    assert.equal(visibleTimeRangeNeedsHistoryLoad({ from: 10, to: 90 }, candles), true)
    assert.equal(visibleTimeRangeNeedsHistoryLoad({ from: 150, to: 250 }, candles), false)
    assert.equal(visibleTimeRangeNeedsHistoryLoad({ from: 400, to: 500 }, candles), false)
  })

  it('detects when a saved range can be restored after history load', () => {
    assert.equal(savedVisibleTimeRangeIsRestorable({ from: 150, to: 250 }, candles), true)
    assert.equal(savedVisibleTimeRangeIsRestorable({ from: 50, to: 150 }, candles), false)
    assert.equal(savedVisibleTimeRangeIsRestorable({ from: 10, to: 90 }, candles), false)
  })
})
