import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  createInfiniteHistoryState,
  loadOlderBtcPerpHistoryCore,
  resetInfiniteHistoryState,
} from './btcPerpetualInfiniteHistoryCore.ts'
import type { BinanceKlinesResponse } from './types.ts'
import type { MarketCandle } from './types.ts'

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
    dailyVwap: {
      byKey: {} as ChartSeriesBundle['dailyVwap']['byKey'],
      ordered: [line, line, line] as ChartSeriesBundle['dailyVwap']['ordered'],
      band: { updateBandData: () => {}, setBandVisible: () => {}, update: () => {}, dispose: () => {} },
    },
    weeklyVwap: {
      byKey: {} as ChartSeriesBundle['weeklyVwap']['byKey'],
      ordered: [line, line, line] as ChartSeriesBundle['weeklyVwap']['ordered'],
      band: { updateBandData: () => {}, setBandVisible: () => {}, update: () => {}, dispose: () => {} },
    },
    monthlyVwap: {
      byKey: {} as ChartSeriesBundle['monthlyVwap']['byKey'],
      ordered: [line, line, line] as ChartSeriesBundle['monthlyVwap']['ordered'],
      band: { updateBandData: () => {}, setBandVisible: () => {}, update: () => {}, dispose: () => {} },
    },
    quarterlyVwap: {
      byKey: {} as ChartSeriesBundle['quarterlyVwap']['byKey'],
      ordered: [line, line, line] as ChartSeriesBundle['quarterlyVwap']['ordered'],
      band: { updateBandData: () => {}, setBandVisible: () => {}, update: () => {}, dispose: () => {} },
    },
    yearlyVwap: {
      byKey: {} as ChartSeriesBundle['yearlyVwap']['byKey'],
      ordered: [line, line, line] as ChartSeriesBundle['yearlyVwap']['ordered'],
      band: { updateBandData: () => {}, setBandVisible: () => {}, update: () => {}, dispose: () => {} },
    },
    rollingVwaps: new Map(),
    anchoredVwaps: new Map(),
  }
}

describe('loadOlderBtcPerpHistoryCore', () => {
  it('allows retry after transport failure', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_100)] }
    const before = candlesRef.current[0].time
    let attempts = 0

    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async () => {
        attempts += 1
        throw new Error('network down')
      },
      applyMergedHistory: () => {},
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    assert.equal(state.exhausted, false)
    assert.equal(state.loading, false)
    assert.equal(state.requestedBefore.has(before), false)
    assert.equal(attempts, 1)

    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async () => {
        attempts += 1
        return { symbol: 'BTCUSDT', interval: '1m', candles: [candle(before - 60)] }
      },
      applyMergedHistory: (_bundle, merged) => {
        candlesRef.current = [...merged]
      },
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    assert.equal(attempts, 2)
    assert.equal(candlesRef.current[0].time, before - 60)
  })

  it('does not apply data for stale generation', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_200)] }
    const before = candlesRef.current[0].time

    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async () => {
        state.generation = 2
        return { symbol: 'BTCUSDT', interval: '1m', candles: [candle(before - 120)] }
      },
      applyMergedHistory: () => {
        throw new Error('should not apply')
      },
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    assert.equal(candlesRef.current.length, 1)
    assert.equal(candlesRef.current[0].time, 1_700_000_200)
  })

  it('stale response does not mutate new generation lock or flags', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const before = 1_700_000_400
    const candlesRef = { current: [candle(before)] }
    let resolveFetch: (value: BinanceKlinesResponse) => void = () => {}
    const fetchDeferred = new Promise<BinanceKlinesResponse>((resolve) => {
      resolveFetch = resolve
    })

    const staleRequest = loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async () => fetchDeferred,
      applyMergedHistory: () => {
        throw new Error('should not apply')
      },
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    resetInfiniteHistoryState(state, 2)
    state.requestedBefore.add(before)
    state.loading = true

    resolveFetch({
      symbol: 'BTCUSDT',
      interval: '1m',
      candles: [candle(before - 60)],
    })
    await staleRequest

    assert.equal(state.generation, 2)
    assert.equal(state.requestedBefore.has(before), true)
    assert.equal(state.loading, true)
    assert.equal(state.exhausted, false)
    assert.equal(candlesRef.current.length, 1)
    assert.equal(candlesRef.current[0].time, before)
  })

  it('releases before lock on interval mismatch', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_000_300)] }
    const before = candlesRef.current[0].time

    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async () => ({
        symbol: 'BTCUSDT',
        interval: '5m',
        candles: [candle(before - 300)],
      }),
      applyMergedHistory: () => {},
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    assert.equal(state.requestedBefore.has(before), false)
    assert.equal(state.exhausted, false)
  })

  it('releases before lock on abort so the same page can be retried', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_001_000)] }
    const before = candlesRef.current[0].time
    const controller = new AbortController()

    const abortedRequest = loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      signal: controller.signal,
      fetchHistory: (_interval, _beforeEpochSeconds, signal) =>
        new Promise<BinanceKlinesResponse>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      applyMergedHistory: () => {
        throw new Error('aborted page must not apply history')
      },
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    controller.abort()
    await abortedRequest

    assert.equal(state.loading, false)
    assert.equal(state.requestedBefore.has(before), false)
    assert.equal(candlesRef.current.length, 1)

    let retryAttempts = 0
    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async (interval) => {
        retryAttempts += 1
        return { symbol: 'BTCUSDT', interval, candles: [candle(before - 60)] }
      },
      applyMergedHistory: (_bundle, merged) => {
        candlesRef.current = [...merged]
      },
      mergeOlderCandles: (existing, older) => [...older, ...existing],
    })

    assert.equal(retryAttempts, 1)
    assert.equal(candlesRef.current.length, 2)
    assert.equal(candlesRef.current[0].time, before - 60)
  })

  it('calls onHistoryMerged after prepending candles but not on abort', async () => {
    const state = createInfiniteHistoryState()
    state.generation = 1
    const candlesRef = { current: [candle(1_700_002_000)] }
    const before = candlesRef.current[0].time
    const mergedLengths: number[] = []

    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      fetchHistory: async (interval) => ({
        symbol: 'BTCUSDT',
        interval,
        candles: [candle(before - 120), candle(before - 60)],
      }),
      applyMergedHistory: (_bundle, merged) => {
        candlesRef.current = [...merged]
      },
      mergeOlderCandles: (existing, older) => [...older, ...existing],
      onHistoryMerged: () => {
        mergedLengths.push(candlesRef.current.length)
      },
    })

    assert.deepEqual(mergedLengths, [3])

    const abortController = new AbortController()
    abortController.abort()
    const abortCalls: number[] = []
    await loadOlderBtcPerpHistoryCore({
      state,
      generation: 1,
      interval: '1m',
      before: candlesRef.current[0].time,
      candlesRef,
      bundle: fakeBundle(),
      chart: fakeChart(),
      signal: abortController.signal,
      fetchHistory: async () => {
        throw new DOMException('Aborted', 'AbortError')
      },
      applyMergedHistory: () => {},
      mergeOlderCandles: (existing, older) => [...older, ...existing],
      onHistoryMerged: () => {
        abortCalls.push(1)
      },
    })

    assert.deepEqual(abortCalls, [])
  })
})
