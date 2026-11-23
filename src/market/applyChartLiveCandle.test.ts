import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChartSeriesBundle, LiveVwapUpdateContext } from './applyChartLiveCandle.ts'
import type { MarketIndicatorId } from './indicators.ts'
import { applyChartLiveCandle } from './applyChartLiveCandle.ts'
import {
  applyChartHistorySeries,
  hydratePlannedChartIndicatorSeries,
} from './applyChartHistorySeries.ts'
import {
  EMPTY_CHART_INDICATOR_SERIES_PLAN,
  resolveChartIndicatorSeriesPlan,
  type ChartIndicatorSeriesPlan,
} from './chartIndicatorSeriesPlan.ts'
import { computeDailyVwap } from './dailyVwap.ts'
import { computeEmaLine, EMA_PERIODS } from './ema.ts'
import { computeWeeklyVwap } from './weeklyVwap.ts'
import { VWAP_CHART_SERIES_KEYS } from './vwapChartLineStyles.ts'
import type { MarketCandle } from './types.ts'

type SeriesCallLog = { setData: unknown[][]; updates: unknown[] }

function makeCandles(count: number, startTime = 1_700_000_000, step = 60): MarketCandle[] {
  const candles: MarketCandle[] = []
  for (let index = 0; index < count; index += 1) {
    const close = 30_000 + Math.sin(index / 9) * 400 + (index % 5)
    const time = startTime + index * step
    candles.push({
      symbol: 'BTCUSDT',
      interval: step === 60 ? '1m' : '1h',
      time,
      open: close - 15,
      high: close + 35,
      low: close - 35,
      close,
      volume: 8 + (index % 11),
      closed: true,
    })
  }
  return candles
}

function nextCandle(candles: readonly MarketCandle[], close = 31_234): MarketCandle {
  const last = candles[candles.length - 1]
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: last.time + 60,
    open: close - 10,
    high: close + 30,
    low: close - 30,
    close,
    volume: 12,
    closed: false,
  }
}

function trackedBundle(options: { rsi?: boolean } = {}) {
  const calls = new Map<string, SeriesCallLog>()
  const track = (name: string) => {
    const log: SeriesCallLog = { setData: [], updates: [] }
    calls.set(name, log)
    return {
      setData: (data: unknown[]) => log.setData.push(data),
      update: (point: unknown) => log.updates.push(point),
      applyOptions: () => {},
      attachPrimitive: () => {},
      detachPrimitive: () => {},
      priceScale: () => ({ options: () => ({ mode: 0 }) }),
      priceToCoordinate: () => null,
      coordinateToPrice: () => null,
      barsInLogicalRange: () => null,
    }
  }
  const bandUpdates = new Map<string, unknown[][]>()
  const makeVwap = (level: string) => {
    const byKey = {} as Record<(typeof VWAP_CHART_SERIES_KEYS)[number], ReturnType<typeof track>>
    for (const key of VWAP_CHART_SERIES_KEYS) {
      byKey[key] = track(`${level}.${key}`)
    }
    const updates: unknown[][] = []
    bandUpdates.set(level, updates)
    return {
      byKey,
      ordered: VWAP_CHART_SERIES_KEYS.map((key) => byKey[key]),
      band: {
        updateBandData: (points: unknown[]) => updates.push(points),
        setBandVisible: () => {},
        setFillStyle: () => {},
        update: () => {},
        dispose: () => {},
      },
    }
  }

  const rsi = {
    series: track('rsi.series'),
    overbought: track('rsi.overbought'),
    oversold: track('rsi.oversold'),
  }

  const bundle = {
    candle: track('candle'),
    emas: EMA_PERIODS.map((period) => track(`ema${period}`)),
    ema100: track('ema100'),
    ema200: track('ema200'),
    dailyVwap: makeVwap('daily'),
    weeklyVwap: makeVwap('weekly'),
    monthlyVwap: makeVwap('monthly'),
    quarterlyVwap: makeVwap('quarterly'),
    yearlyVwap: makeVwap('yearly'),
    rollingVwaps: new Map(),
    anchoredVwaps: new Map(),
    rsi: options.rsi
      ? {
          series: rsi.series,
          overboughtFillSeries: rsi.overbought,
          oversoldFillSeries: rsi.oversold,
          settings: { period: 14, overbought: 70, oversold: 30, thresholdGlow: false },
          pane: 1,
        }
      : null,
  } as unknown as ChartSeriesBundle

  const seriesCalls = (name: string): SeriesCallLog => {
    const log = calls.get(name)
    assert.ok(log, `series ${name} was never created`)
    return log
  }

  return { bundle, seriesCalls, bandUpdates }
}

function plan(...indicators: MarketIndicatorId[]): ChartIndicatorSeriesPlan {
  return resolveChartIndicatorSeriesPlan({ activeIndicators: indicators, interval: '1m' })
}

function contextFor(
  activeIndicators: readonly MarketIndicatorId[],
  overrides: Partial<LiveVwapUpdateContext> = {},
): LiveVwapUpdateContext {
  return {
    interval: '1m',
    activeIndicators,
    loadedLevel: 'daily',
    loadedInterval: '1m',
    ...overrides,
  }
}

describe('applyChartLiveCandle with an indicator plan', () => {
  it('updates only the candle series when every indicator is off', () => {
    const candles = makeCandles(400)
    const { bundle, seriesCalls, bandUpdates } = trackedBundle()
    const tick = nextCandle(candles)
    applyChartLiveCandle([...candles], tick, bundle, contextFor([]))

    assert.equal(seriesCalls('candle').updates.length, 1)
    for (const period of EMA_PERIODS) {
      assert.deepEqual(seriesCalls(`ema${period}`).updates, [])
    }
    assert.deepEqual(seriesCalls('ema100').updates, [])
    assert.deepEqual(seriesCalls('ema200').updates, [])
    assert.deepEqual(seriesCalls('daily.vwap').updates, [])
    assert.deepEqual(bandUpdates.get('daily'), [])
  })

  it('pushes exactly the full-reference last point for active EMAs', () => {
    const candles = makeCandles(400)
    const tick = nextCandle(candles)
    const { bundle, seriesCalls } = trackedBundle()
    const live = [...candles, tick]
    applyChartLiveCandle(live, tick, bundle, contextFor(['triple-ema', 'dual-ema']))

    for (const period of EMA_PERIODS) {
      const reference = computeEmaLine([...live], period)
      const last = reference[reference.length - 1]
      assert.deepEqual(seriesCalls(`ema${period}`).updates, [
        { time: last.time, value: last.value },
      ])
    }
    for (const [name, period] of [
      ['ema100', 100],
      ['ema200', 200],
    ] as const) {
      const reference = computeEmaLine([...live], period)
      const last = reference[reference.length - 1]
      assert.deepEqual(seriesCalls(name).updates, [{ time: last.time, value: last.value }])
    }
  })

  it('skips live work for inactive EMA groups but keeps the active one', () => {
    const candles = makeCandles(400)
    const tick = nextCandle(candles)
    const { bundle, seriesCalls } = trackedBundle()
    applyChartLiveCandle([...candles, tick], tick, bundle, contextFor(['dual-ema']))

    for (const period of EMA_PERIODS) {
      assert.deepEqual(seriesCalls(`ema${period}`).updates, [])
    }
    assert.equal(seriesCalls('ema100').updates.length, 1)
    assert.equal(seriesCalls('ema200').updates.length, 1)
  })

  it('updates a selected session VWAP only while its context is loaded', () => {
    const candles = makeCandles(400)
    const tick = nextCandle(candles)

    const loaded = trackedBundle()
    applyChartLiveCandle([...candles, tick], tick, loaded.bundle, contextFor(['daily-vwap']))
    const reference = computeDailyVwap([...candles, tick])
    const last = reference[reference.length - 1]
    assert.deepEqual(loaded.seriesCalls('daily.vwap').updates, [
      { time: last.time, value: last.vwap },
    ])
    assert.equal(loaded.seriesCalls('weekly.vwap').updates.length, 0)

    const notLoaded = trackedBundle()
    applyChartLiveCandle(
      [...candles, tick],
      tick,
      notLoaded.bundle,
      contextFor(['daily-vwap'], { loadedLevel: null }),
    )
    assert.deepEqual(notLoaded.seriesCalls('daily.vwap').updates, [])
  })

  it('never pushes a latest-only point onto a series whose history was skipped', () => {
    const candles = makeCandles(400)
    const { bundle, seriesCalls } = trackedBundle()
    let live = candles

    applyChartHistorySeries(bundle, live, [], [], EMPTY_CHART_INDICATOR_SERIES_PLAN)
    for (let index = 0; index < 3; index += 1) {
      const tick = nextCandle(live, 31_000 + index)
      live = [...live, tick]
      applyChartLiveCandle(live, tick, bundle, contextFor([]))
    }
    for (const period of EMA_PERIODS) {
      assert.deepEqual(seriesCalls(`ema${period}`).updates, [])
      assert.deepEqual(seriesCalls(`ema${period}`).setData, [])
    }

    // Enabling immediately after the ticks equals a full reference apply.
    assert.deepEqual(hydratePlannedChartIndicatorSeries(bundle, live, plan('triple-ema')), [
      'triple-ema',
    ])
    for (const period of EMA_PERIODS) {
      assert.deepEqual(
        seriesCalls(`ema${period}`).setData[0],
        computeEmaLine([...live], period).map((point) => ({
          time: point.time,
          value: point.value,
        })),
      )
      assert.deepEqual(seriesCalls(`ema${period}`).updates, [])
    }

    const tick = nextCandle(live, 32_000)
    const after = [...live, tick]
    applyChartLiveCandle(after, tick, bundle, contextFor(['triple-ema']))
    for (const period of EMA_PERIODS) {
      const reference = computeEmaLine([...after], period)
      const last = reference[reference.length - 1]
      assert.deepEqual(seriesCalls(`ema${period}`).updates, [
        { time: last.time, value: last.value },
      ])
    }
  })

  it('applies VWAP live data for a selected weekly VWAP with a weekly context', () => {
    const candles = makeCandles(400)
    const tick = nextCandle(candles)
    const { bundle, seriesCalls } = trackedBundle()
    applyChartLiveCandle(
      [...candles, tick],
      tick,
      bundle,
      contextFor(['weekly-vwap'], { loadedLevel: 'weekly' }),
    )
    const reference = computeWeeklyVwap([...candles, tick])
    const last = reference[reference.length - 1]
    assert.deepEqual(seriesCalls('weekly.vwap').updates, [
      { time: last.time, value: last.vwap },
    ])
  })

  it('still updates the RSI pane when it exists (pane presence gates it)', () => {
    const candles = makeCandles(400)
    const tick = nextCandle(candles)
    const { bundle, seriesCalls } = trackedBundle({ rsi: true })
    applyChartLiveCandle([...candles, tick], tick, bundle, contextFor([]))
    assert.equal(seriesCalls('rsi.series').updates.length, 1)
    assert.equal(seriesCalls('rsi.overbought').updates.length, 1)
    assert.equal(seriesCalls('rsi.oversold').updates.length, 1)
  })

  it('is unchanged for callers without a live context (isolated charts)', () => {
    const candles = makeCandles(400)
    const tick = nextCandle(candles)
    const { bundle, seriesCalls } = trackedBundle()
    applyChartLiveCandle([...candles, tick], tick, bundle)
    for (const period of EMA_PERIODS) {
      assert.equal(seriesCalls(`ema${period}`).updates.length, 1)
    }
    assert.equal(seriesCalls('daily.vwap').updates.length, 1)
  })
})
