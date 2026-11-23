import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  appliedChartIndicatorSeries,
  applyChartHistorySeries,
  hydratePlannedChartIndicatorSeries,
  resetChartIndicatorSeriesApplication,
  retainPlannedChartIndicatorSeries,
} from './applyChartHistorySeries.ts'
import {
  EMPTY_CHART_INDICATOR_SERIES_PLAN,
  resolveChartIndicatorSeriesPlan,
} from './chartIndicatorSeriesPlan.ts'
import { computeDailyVwap } from './dailyVwap.ts'
import { dailyVwapPointsToLineData } from './dailyVwapLineData.ts'
import { computeEmaLine, EMA_PERIODS } from './ema.ts'
import { computeMonthlyVwap } from './monthlyVwap.ts'
import { computeQuarterlyVwap } from './quarterlyVwap.ts'
import { computeWeeklyVwap } from './weeklyVwap.ts'
import { computeYearlyVwap } from './yearlyVwap.ts'
import { weeklyVwapPointsToLineData } from './weeklyVwapLineData.ts'
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
      closed: index < count - 1,
    })
  }
  return candles
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
  const bandCalls = new Map<string, unknown[][]>()
  const makeVwap = (level: string) => {
    const byKey = {} as Record<(typeof VWAP_CHART_SERIES_KEYS)[number], ReturnType<typeof track>>
    for (const key of VWAP_CHART_SERIES_KEYS) {
      byKey[key] = track(`${level}.${key}`)
    }
    const bandUpdates: unknown[][] = []
    bandCalls.set(level, bandUpdates)
    return {
      byKey,
      ordered: VWAP_CHART_SERIES_KEYS.map((key) => byKey[key]),
      band: {
        updateBandData: (points: unknown[]) => bandUpdates.push(points),
        setBandVisible: () => {},
        setFillStyle: () => {},
        update: () => {},
        dispose: () => {},
      },
    }
  }

  const rsiLines = {
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
          series: rsiLines.series,
          overboughtFillSeries: rsiLines.overbought,
          oversoldFillSeries: rsiLines.oversold,
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

  return { bundle, seriesCalls, bandCalls }
}

const triplePlan = resolveChartIndicatorSeriesPlan({
  activeIndicators: ['triple-ema'],
  interval: '1m',
})

function emaLinePoints(candles: readonly MarketCandle[], period: number) {
  return computeEmaLine([...candles], period).map((point) => ({
    time: point.time,
    value: point.value,
  }))
}

describe('applyChartHistorySeries with an indicator plan', () => {
  const candles = makeCandles(600)

  it('derives only the candle series when every indicator is off', () => {
    const { bundle, seriesCalls } = trackedBundle()
    applyChartHistorySeries(bundle, candles, [], [], EMPTY_CHART_INDICATOR_SERIES_PLAN)

    assert.equal(seriesCalls('candle').setData.length, 1)
    assert.equal(seriesCalls('candle').setData[0]?.length, candles.length)

    for (const period of EMA_PERIODS) {
      assert.equal(seriesCalls(`ema${period}`).setData.length, 0)
    }
    assert.equal(seriesCalls('ema100').setData.length, 0)
    assert.equal(seriesCalls('ema200').setData.length, 0)
    for (const level of ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']) {
      assert.deepEqual(seriesCalls(`${level}.vwap`).setData, [])
      assert.deepEqual(seriesCalls(`${level}.previousUpper1`).setData, [])
      assert.deepEqual(seriesCalls(`${level}.previousLower1`).setData, [])
    }
    assert.deepEqual(appliedChartIndicatorSeries(bundle), [])
  })

  it('keeps the full reference values for every planned series (default = full plan)', () => {
    const { bundle, seriesCalls } = trackedBundle()
    applyChartHistorySeries(bundle, candles)

    for (const period of EMA_PERIODS) {
      assert.deepEqual(seriesCalls(`ema${period}`).setData[0], emaLinePoints(candles, period))
    }
    assert.deepEqual(seriesCalls('ema100').setData[0], emaLinePoints(candles, 100))
    assert.deepEqual(seriesCalls('ema200').setData[0], emaLinePoints(candles, 200))

    const daily = computeDailyVwap(candles)
    for (const key of VWAP_CHART_SERIES_KEYS) {
      assert.deepEqual(
        seriesCalls(`daily.${key}`).setData[0],
        dailyVwapPointsToLineData(daily, key),
      )
    }
    assert.deepEqual(seriesCalls('weekly.vwap').setData[0], weeklyVwapPointsToLineData(computeWeeklyVwap(candles), 'vwap'))
    assert.equal(seriesCalls('monthly.vwap').setData[0]?.length, computeMonthlyVwap(candles).length)
    assert.equal(
      seriesCalls('quarterly.vwap').setData[0]?.length,
      computeQuarterlyVwap(candles).length,
    )
    assert.equal(seriesCalls('yearly.vwap').setData[0]?.length, computeYearlyVwap(candles).length)
    assert.deepEqual(appliedChartIndicatorSeries(bundle), [
      'triple-ema',
      'dual-ema',
      'daily-vwap',
      'weekly-vwap',
      'monthly-vwap',
      'quarterly-vwap',
      'yearly-vwap',
    ])
  })

  it('matches the full apply exactly for a partially planned configuration', () => {
    const plan = resolveChartIndicatorSeriesPlan({
      activeIndicators: ['triple-ema', 'monthly-vwap'],
      interval: '4h',
    })
    const target = trackedBundle()
    const reference = trackedBundle()
    applyChartHistorySeries(target.bundle, candles, [], [], plan)
    applyChartHistorySeries(reference.bundle, candles)

    for (const period of EMA_PERIODS) {
      assert.deepEqual(
        target.seriesCalls(`ema${period}`).setData,
        reference.seriesCalls(`ema${period}`).setData,
      )
    }
    for (const key of VWAP_CHART_SERIES_KEYS) {
      assert.deepEqual(
        target.seriesCalls(`monthly.${key}`).setData,
        reference.seriesCalls(`monthly.${key}`).setData,
      )
    }
  })

  it('still applies RSI history whenever its pane exists (pane presence gates it)', () => {
    const planned = trackedBundle({ rsi: true })
    applyChartHistorySeries(planned.bundle, candles, [], [], EMPTY_CHART_INDICATOR_SERIES_PLAN)
    assert.equal(planned.seriesCalls('rsi.series').setData.length, 1)
    assert.equal(planned.seriesCalls('rsi.overbought').setData.length, 1)
    assert.equal(planned.seriesCalls('rsi.oversold').setData.length, 1)
  })
})

describe('indicator series hydration', () => {
  const candles = makeCandles(600)

  it('hydrates a newly enabled indicator to the full reference without recomputing the others', () => {
    const { bundle, seriesCalls } = trackedBundle()
    applyChartHistorySeries(bundle, candles, [], [], triplePlan)

    const dailyPlan = resolveChartIndicatorSeriesPlan({
      activeIndicators: ['triple-ema', 'daily-vwap'],
      interval: '1m',
    })
    assert.deepEqual(hydratePlannedChartIndicatorSeries(bundle, candles, dailyPlan), ['daily-vwap'])
    assert.deepEqual(
      seriesCalls('daily.vwap').setData[0],
      dailyVwapPointsToLineData(computeDailyVwap(candles), 'vwap'),
    )
    for (const period of EMA_PERIODS) {
      assert.equal(seriesCalls(`ema${period}`).setData.length, 1)
    }
    assert.deepEqual(hydratePlannedChartIndicatorSeries(bundle, candles, dailyPlan), [])
  })

  it('rehydrates an indicator that was switched off and on again', () => {
    const { bundle, seriesCalls } = trackedBundle()
    applyChartHistorySeries(bundle, candles, [], [], triplePlan)

    retainPlannedChartIndicatorSeries(bundle, EMPTY_CHART_INDICATOR_SERIES_PLAN)
    assert.deepEqual(appliedChartIndicatorSeries(bundle), [])
    assert.deepEqual(seriesCalls('ema13').setData.length, 1)

    assert.deepEqual(hydratePlannedChartIndicatorSeries(bundle, candles, triplePlan), [
      'triple-ema',
    ])
    assert.deepEqual(seriesCalls('ema13').setData[1], emaLinePoints(candles, 13))
  })

  it('forgets applied series on an interval reset and hydrates from the new candles', () => {
    const { bundle, seriesCalls } = trackedBundle()
    applyChartHistorySeries(bundle, candles, [], [], triplePlan)
    resetChartIndicatorSeriesApplication(bundle)
    assert.deepEqual(appliedChartIndicatorSeries(bundle), [])

    const nextCandles = makeCandles(300, 1_800_000_000, 300)
    assert.deepEqual(hydratePlannedChartIndicatorSeries(bundle, nextCandles, triplePlan), [
      'triple-ema',
    ])
    assert.deepEqual(seriesCalls('ema13').setData[1], emaLinePoints(nextCandles, 13))
  })

  it('keeps per-bundle state independent (multi-panel)', () => {
    const first = trackedBundle()
    const second = trackedBundle()
    applyChartHistorySeries(first.bundle, candles, [], [], triplePlan)
    applyChartHistorySeries(second.bundle, candles, [], [], EMPTY_CHART_INDICATOR_SERIES_PLAN)

    assert.deepEqual(appliedChartIndicatorSeries(first.bundle), ['triple-ema'])
    assert.deepEqual(appliedChartIndicatorSeries(second.bundle), [])
    assert.deepEqual(hydratePlannedChartIndicatorSeries(second.bundle, candles, triplePlan), [
      'triple-ema',
    ])
    assert.equal(first.seriesCalls('ema13').setData.length, 1)
    assert.equal(second.seriesCalls('ema13').setData.length, 1)
  })
})
