import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  createInfiniteHistoryState,
  loadOlderBtcPerpHistoryCore,
} from './btcPerpetualInfiniteHistoryCore.ts'
import {
  historySatisfiesIndicatorTarget,
  preloadIndicatorHistory,
} from './indicatorHistoryPreload.ts'
import type { BinanceKlinesResponse, MarketCandle } from './types.ts'

const PAGE_SIZE = 500

function candle(time: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
  }
}

function fakeChart(): IChartApi {
  return {
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      setVisibleLogicalRange: () => {},
      subscribeVisibleLogicalRangeChange: () => {},
      unsubscribeVisibleLogicalRangeChange: () => {},
    }),
  } as IChartApi
}

function fakeBundle(): ChartSeriesBundle {
  const line = { setData: () => {}, update: () => {}, applyOptions: () => {} }
  return {
    candle: { setData: () => {}, update: () => {}, barsInLogicalRange: () => null } as ChartSeriesBundle['candle'],
    emas: [line, line, line] as ChartSeriesBundle['emas'],
    ema100: line as ChartSeriesBundle['ema100'],
    ema200: line as ChartSeriesBundle['ema200'],
    dailyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['dailyVwap'],
    weeklyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['weeklyVwap'],
    monthlyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['monthlyVwap'],
    quarterlyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['quarterlyVwap'],
    yearlyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['yearlyVwap'],
    rollingVwaps: new Map(),
    anchoredVwaps: new Map(),
  }
}

function pageBefore(oldestTime: number): MarketCandle[] {
  return Array.from({ length: PAGE_SIZE }, (_, index) =>
    candle(oldestTime - (PAGE_SIZE - index) * 60),
  )
}

describe('historySatisfiesIndicatorTarget', () => {
  it('requires both the bar target and the earliest timestamp', () => {
    const candles = [candle(1000), candle(2000), candle(3000)]
    assert.equal(historySatisfiesIndicatorTarget(candles, { warmupBars: 3, earliestTime: 1000 }), true)
    assert.equal(historySatisfiesIndicatorTarget(candles, { warmupBars: 4, earliestTime: 1000 }), false)
    assert.equal(historySatisfiesIndicatorTarget(candles, { warmupBars: 3, earliestTime: 900 }), false)
    assert.equal(historySatisfiesIndicatorTarget(candles, { warmupBars: 0, earliestTime: null }), true)
  })
})

describe('preloadIndicatorHistory', () => {
  it('paginates through the existing history core until satisfied without duplicate before requests', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = {
      current: Array.from({ length: 750 }, (_, index) => candle(1_700_000_000 + index * 60)),
    }
    const beforeRequests: number[] = []

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 1000, earliestTime: null },
      candlesRef,
      loadOlderPage: (before) =>
        loadOlderBtcPerpHistoryCore({
          state,
          generation: 1,
          interval: '1m',
          before,
          candlesRef,
          bundle: fakeBundle(),
          chart: fakeChart(),
          fetchHistory: async (interval, beforeEpochSeconds): Promise<BinanceKlinesResponse> => {
            beforeRequests.push(beforeEpochSeconds)
            assert.equal(interval, '1m')
            return { symbol: 'BTCUSDT', interval, candles: pageBefore(beforeEpochSeconds) }
          },
          applyMergedHistory: (_bundle, merged) => {
            candlesRef.current = [...merged]
          },
          mergeOlderCandles: (existing, older) => [...older, ...existing],
        }),
    })

    assert.equal(result, 'satisfied')
    assert.equal(beforeRequests.length, 1)
    assert.equal(beforeRequests[0], candlesRef.current[0].time + PAGE_SIZE * 60)
    assert.equal(new Set(beforeRequests).size, beforeRequests.length)
    assert.equal(candlesRef.current.length, 1250)
    assert.equal(state.requestedBefore.has(beforeRequests[0]), true)
  })

  it('pages multiple times with distinct before requests until satisfied', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = {
      current: Array.from({ length: 750 }, (_, index) => candle(1_700_000_000 + index * 60)),
    }
    const beforeRequests: number[] = []

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 2000, earliestTime: null },
      candlesRef,
      loadOlderPage: (before) =>
        loadOlderBtcPerpHistoryCore({
          state,
          generation: 1,
          interval: '1m',
          before,
          candlesRef,
          bundle: fakeBundle(),
          chart: fakeChart(),
          fetchHistory: async (interval, beforeEpochSeconds): Promise<BinanceKlinesResponse> => {
            beforeRequests.push(beforeEpochSeconds)
            return { symbol: 'BTCUSDT', interval, candles: pageBefore(beforeEpochSeconds) }
          },
          applyMergedHistory: (_bundle, merged) => {
            candlesRef.current = [...merged]
          },
          mergeOlderCandles: (existing, older) => [...older, ...existing],
        }),
    })

    assert.equal(result, 'satisfied')
    assert.equal(beforeRequests.length, 3)
    assert.equal(new Set(beforeRequests).size, beforeRequests.length)
    assert.equal(candlesRef.current.length, 2250)
    assert.equal(state.requestedBefore.size, 3)
  })

  it('stops immediately when history is already satisfied', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: Array.from({ length: 1000 }, (_, index) => candle(index)) }
    const beforeRequests: number[] = []

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 1000, earliestTime: null },
      candlesRef,
      loadOlderPage: async (before) => {
        beforeRequests.push(before)
      },
    })

    assert.equal(result, 'satisfied')
    assert.deepEqual(beforeRequests, [])
  })

  it('stops at the page limit', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_000)] }
    let calls = 0

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 10_000, earliestTime: null },
      candlesRef,
      maxPages: 2,
      loadOlderPage: async () => {
        calls += 1
        candlesRef.current = [...pageBefore(candlesRef.current[0].time), ...candlesRef.current]
      },
    })

    assert.equal(result, 'page-limit')
    assert.equal(calls, 2)
  })

  it('returns exhausted when the backend cannot supply more history', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_000)] }

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 1000, earliestTime: null },
      candlesRef,
      loadOlderPage: (before) =>
        loadOlderBtcPerpHistoryCore({
          state,
          generation: 1,
          interval: '1m',
          before,
          candlesRef,
          bundle: fakeBundle(),
          chart: fakeChart(),
          fetchHistory: async (interval) => ({ symbol: 'BTCUSDT', interval, candles: [] }),
          applyMergedHistory: (_bundle, merged) => {
            candlesRef.current = [...merged]
          },
          mergeOlderCandles: (existing, older) => [...older, ...existing],
        }),
    })

    assert.equal(result, 'exhausted')
    assert.equal(state.exhausted, true)
  })

  it('invalidates an in-flight preload when the generation changes', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_000)] }
    const beforeRequests: number[] = []

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 1000, earliestTime: null },
      candlesRef,
      loadOlderPage: (before) =>
        loadOlderBtcPerpHistoryCore({
          state,
          generation: 1,
          interval: '1m',
          before,
          candlesRef,
          bundle: fakeBundle(),
          chart: fakeChart(),
          fetchHistory: async (interval, beforeEpochSeconds): Promise<BinanceKlinesResponse> => {
            beforeRequests.push(beforeEpochSeconds)
            state.generation = 2
            return { symbol: 'BTCUSDT', interval, candles: pageBefore(beforeEpochSeconds) }
          },
          applyMergedHistory: () => {
            throw new Error('stale preload must not apply history')
          },
          mergeOlderCandles: (existing, older) => [...older, ...existing],
        }),
    })

    assert.equal(result, 'stale')
    assert.equal(beforeRequests.length, 1)
    assert.equal(candlesRef.current.length, 1)
  })

  it('stops when a page makes no progress and waits while another load is in flight', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    state.loading = true
    const candlesRef = { current: [candle(1_700_000_000)] }
    let calls = 0
    let idleWaits = 0

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 1000, earliestTime: null },
      candlesRef,
      waitForIdle: async () => {
        idleWaits += 1
        state.loading = false
      },
      loadOlderPage: async () => {
        calls += 1
      },
    })

    assert.equal(result, 'no-progress')
    assert.equal(calls, 1)
    assert.equal(idleWaits, 1)
  })

  it('honours an aborted signal before requesting history', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_000)] }
    const controller = new AbortController()
    controller.abort()
    let calls = 0

    const result = await preloadIndicatorHistory({
      state,
      generation: 1,
      target: { warmupBars: 1000, earliestTime: null },
      candlesRef,
      signal: controller.signal,
      loadOlderPage: async () => {
        calls += 1
      },
    })

    assert.equal(result, 'aborted')
    assert.equal(calls, 0)
  })
})
