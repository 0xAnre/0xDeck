import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { createInfiniteHistoryState, type InfiniteHistoryState } from './btcPerpetualInfiniteHistoryCore.ts'
import { loadOlderHistoryUntilVisibleFrom } from './btcPerpetualViewportHistory.ts'
import { EMPTY_CHART_INDICATOR_SERIES_PLAN, resolveChartIndicatorSeriesPlan } from './chartIndicatorSeriesPlan.ts'
import type { BinanceKlinesResponse, MarketCandle } from './types.ts'

const PAGE_BARS = 500
const STEP_SECONDS = 60
const FIRST_TIME = 1_700_000_000

function candle(time: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
    closed: true,
  }
}

/** `count` candles ending just before `before`, ascending. */
function pageBefore(before: number, count = PAGE_BARS): MarketCandle[] {
  const candles: MarketCandle[] = []
  const start = before - count * STEP_SECONDS
  for (let index = 0; index < count; index += 1) {
    candles.push(candle(start + index * STEP_SECONDS))
  }
  return candles
}

function initialCandles(count = 750): MarketCandle[] {
  return Array.from({ length: count }, (_, index) => candle(FIRST_TIME + index * STEP_SECONDS))
}

type CallCounters = {
  visibleLogicalRangeWrites: number
  candleSetData: unknown[][]
  indicatorSetData: number
}

function fakeChart(counters: CallCounters): IChartApi {
  return {
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      setVisibleLogicalRange: () => {
        counters.visibleLogicalRangeWrites += 1
      },
      subscribeVisibleLogicalRangeChange: () => {},
      unsubscribeVisibleLogicalRangeChange: () => {},
    }),
  } as unknown as IChartApi
}

function fakeBundle(counters: CallCounters): ChartSeriesBundle {
  const line = () => ({
    setData: () => {
      counters.indicatorSetData += 1
    },
    update: () => {},
    applyOptions: () => {},
    attachPrimitive: () => {},
    detachPrimitive: () => {},
    priceScale: () => ({ options: () => ({ mode: 0 }) }),
    priceToCoordinate: () => null,
    barsInLogicalRange: () => null,
  })
  const vwap = () => {
    const byKey = {
      vwap: line(),
      previousLower1: line(),
      previousUpper1: line(),
    } as unknown as ChartSeriesBundle['dailyVwap']['byKey']
    return {
      byKey,
      ordered: [byKey.previousLower1, byKey.previousUpper1, byKey.vwap] as ChartSeriesBundle['dailyVwap']['ordered'],
      band: {
        updateBandData: () => {},
        setBandVisible: () => {},
        setFillStyle: () => {},
        update: () => {},
        dispose: () => {},
      },
    }
  }
  return {
    candle: {
      setData: (data: unknown[]) => counters.candleSetData.push(data),
      update: () => {},
      barsInLogicalRange: () => null,
    } as unknown as ChartSeriesBundle['candle'],
    emas: [line(), line(), line()] as ChartSeriesBundle['emas'],
    ema100: line() as ChartSeriesBundle['ema100'],
    ema200: line() as ChartSeriesBundle['ema200'],
    dailyVwap: vwap(),
    weeklyVwap: vwap(),
    monthlyVwap: vwap(),
    quarterlyVwap: vwap(),
    yearlyVwap: vwap(),
    rollingVwaps: new Map(),
    anchoredVwaps: new Map(),
    rsi: null,
  } as unknown as ChartSeriesBundle
}

function newCounters(): CallCounters {
  return { visibleLogicalRangeWrites: 0, candleSetData: [], indicatorSetData: 0 }
}

function makeFetcher(pages: Map<number, MarketCandle[]>, calls: number[]) {
  return async (interval: string, before: number): Promise<BinanceKlinesResponse> => {
    calls.push(before)
    return {
      symbol: 'BTCUSDT',
      interval: interval as BinanceKlinesResponse['interval'],
      candles: pages.get(before) ?? [],
    }
  }
}

/** Saved viewport `pagesBack` pages behind the oldest loaded candle. */
function savedRange(candles: readonly MarketCandle[], pagesBack = 3) {
  const from = candles[0].time - pagesBack * PAGE_BARS * STEP_SECONDS
  return { from, to: from + 400 * STEP_SECONDS }
}

describe('loadOlderHistoryUntilVisibleFrom', () => {
  it('merges every page but rebuilds the series once with the final window', async () => {
    const counters = newCounters()
    const candlesRef = { current: initialCandles() }
    const initial = candlesRef.current
    const range = savedRange(initial, 3)

    const pages = new Map<number, MarketCandle[]>()
    let before = initial[0].time
    for (let page = 0; page < 3; page += 1) {
      pages.set(before, pageBefore(before))
      before -= PAGE_BARS * STEP_SECONDS
    }
    const fetchCalls: number[] = []

    await loadOlderHistoryUntilVisibleFrom({
      state: createInfiniteHistoryState() as InfiniteHistoryState,
      generation: 0,
      exchange: 'binance',
      interval: '1m',
      visibleTimeRange: range,
      candlesRef,
      bundle: fakeBundle(counters),
      chart: fakeChart(counters),
      fetchHistory: makeFetcher(pages, fetchCalls),
      getIndicatorSeriesPlan: () =>
        resolveChartIndicatorSeriesPlan({ activeIndicators: [], interval: '1m' }),
    })

    assert.equal(fetchCalls.length, 3)
    // Exactly one native rebuild, for the final merged window (750 + 3 x 500).
    assert.equal(counters.candleSetData.length, 1)
    assert.equal(counters.candleSetData[0]?.length, 750 + 3 * PAGE_BARS)
    // No per-page logical-range shift: the chart still holds the pre-burst window.
    assert.equal(counters.visibleLogicalRangeWrites, 0)
    // No hidden indicator derivation.
    assert.equal(counters.indicatorSetData, 0)

    // The merged candle window is exactly the sequential merge result.
    const expectedTimes: number[] = []
    let expectedBefore = initial[0].time
    for (let page = 0; page < 3; page += 1) {
      expectedTimes.unshift(
        ...pageBefore(expectedBefore).map((entry) => entry.time),
      )
      expectedBefore -= PAGE_BARS * STEP_SECONDS
    }
    assert.deepEqual(
      candlesRef.current.map((entry) => entry.time),
      [...expectedTimes, ...initial.map((entry) => entry.time)],
    )
  })

  it('applies the final window for the active plan only', async () => {
    const counters = newCounters()
    const candlesRef = { current: initialCandles() }
    const range = savedRange(candlesRef.current, 1)
    const pages = new Map([[candlesRef.current[0].time, pageBefore(candlesRef.current[0].time)]])

    await loadOlderHistoryUntilVisibleFrom({
      state: createInfiniteHistoryState() as InfiniteHistoryState,
      generation: 0,
      exchange: 'binance',
      interval: '1m',
      visibleTimeRange: range,
      candlesRef,
      bundle: fakeBundle(counters),
      chart: fakeChart(counters),
      fetchHistory: makeFetcher(pages, []),
      getIndicatorSeriesPlan: () =>
        resolveChartIndicatorSeriesPlan({ activeIndicators: ['dual-ema'], interval: '1m' }),
    })

    assert.equal(counters.candleSetData.length, 1)
    // EMA 100 + EMA 200 only; the five session VWAPs and 3 EMA stay untouched.
    assert.equal(counters.indicatorSetData, 2)
  })

  it('does not apply or shift anything when the signal aborts mid-burst', async () => {
    const counters = newCounters()
    const candlesRef = { current: initialCandles() }
    const controller = new AbortController()
    const pages = new Map<number, MarketCandle[]>()
    pages.set(candlesRef.current[0].time, pageBefore(candlesRef.current[0].time))
    let calls = 0
    const fetchHistory = async (interval: string, before: number): Promise<BinanceKlinesResponse> => {
      calls += 1
      if (calls === 2) {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      }
      return {
        symbol: 'BTCUSDT',
        interval: interval as BinanceKlinesResponse['interval'],
        candles: pages.get(before) ?? [],
      }
    }

    await loadOlderHistoryUntilVisibleFrom({
      state: createInfiniteHistoryState() as InfiniteHistoryState,
      generation: 0,
      exchange: 'binance',
      interval: '1m',
      visibleTimeRange: savedRange(candlesRef.current, 3),
      candlesRef,
      bundle: fakeBundle(counters),
      chart: fakeChart(counters),
      signal: controller.signal,
      fetchHistory,
      getIndicatorSeriesPlan: () => EMPTY_CHART_INDICATOR_SERIES_PLAN,
    })

    assert.equal(calls, 2)
    assert.equal(counters.candleSetData.length, 0)
    assert.equal(counters.visibleLogicalRangeWrites, 0)
  })

  it('does not apply pages that belong to a stale generation', async () => {
    const counters = newCounters()
    const candlesRef = { current: initialCandles() }
    const state = createInfiniteHistoryState()
    const pages = new Map<number, MarketCandle[]>()
    pages.set(candlesRef.current[0].time, pageBefore(candlesRef.current[0].time))
    let calls = 0
    const fetchHistory = async (interval: string, before: number): Promise<BinanceKlinesResponse> => {
      calls += 1
      if (calls === 2) {
        // An interval switch bumps the state generation while a page is in flight.
        state.generation += 1
      }
      return {
        symbol: 'BTCUSDT',
        interval: interval as BinanceKlinesResponse['interval'],
        candles: pages.get(before) ?? [],
      }
    }

    await loadOlderHistoryUntilVisibleFrom({
      state,
      generation: 0,
      exchange: 'binance',
      interval: '1m',
      visibleTimeRange: savedRange(candlesRef.current, 3),
      candlesRef,
      bundle: fakeBundle(counters),
      chart: fakeChart(counters),
      fetchHistory,
      getIndicatorSeriesPlan: () => EMPTY_CHART_INDICATOR_SERIES_PLAN,
    })

    assert.equal(counters.candleSetData.length, 0)
    assert.equal(counters.visibleLogicalRangeWrites, 0)
  })

  it('stops at the page limit and still applies the pages it merged', async () => {
    const counters = newCounters()
    const candlesRef = { current: initialCandles() }
    let served = 0
    const fetchHistory = async (interval: string, before: number): Promise<BinanceKlinesResponse> => {
      served += 1
      return {
        symbol: 'BTCUSDT',
        interval: interval as BinanceKlinesResponse['interval'],
        candles: pageBefore(before),
      }
    }

    await loadOlderHistoryUntilVisibleFrom({
      state: createInfiniteHistoryState() as InfiniteHistoryState,
      generation: 0,
      exchange: 'binance',
      interval: '1m',
      // Far enough back to exceed 40 pages.
      visibleTimeRange: { from: FIRST_TIME - 60 * PAGE_BARS * 45, to: FIRST_TIME - 60 * PAGE_BARS * 44 },
      candlesRef,
      bundle: fakeBundle(counters),
      chart: fakeChart(counters),
      fetchHistory,
      getIndicatorSeriesPlan: () => EMPTY_CHART_INDICATOR_SERIES_PLAN,
    })

    assert.equal(served, 40)
    assert.equal(counters.candleSetData.length, 1)
    assert.equal(counters.candleSetData[0]?.length, 750 + 40 * PAGE_BARS)
  })

  it('merges nothing and applies nothing when no page is needed', async () => {
    const counters = newCounters()
    const candlesRef = { current: initialCandles() }
    const fetchCalls: number[] = []

    await loadOlderHistoryUntilVisibleFrom({
      state: createInfiniteHistoryState() as InfiniteHistoryState,
      generation: 0,
      exchange: 'binance',
      interval: '1m',
      visibleTimeRange: {
        from: candlesRef.current[0].time,
        to: candlesRef.current[100].time,
      },
      candlesRef,
      bundle: fakeBundle(counters),
      chart: fakeChart(counters),
      fetchHistory: makeFetcher(new Map(), fetchCalls),
      getIndicatorSeriesPlan: () => EMPTY_CHART_INDICATOR_SERIES_PLAN,
    })

    assert.equal(fetchCalls.length, 0)
    assert.equal(counters.candleSetData.length, 0)
  })
})
