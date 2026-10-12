import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { hitTestChartObjectSettingsTarget } from './chartObjectSettingsHitTest.ts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import type { LineInstance } from './lineInstances.ts'

function createChartAndSeries() {
  const chart = {
    timeScale: () => ({
      options: () => ({ barSpacing: 6 }),
      timeToCoordinate: (time: number) => time,
      coordinateToTime: () => 120,
      coordinateToLogical: (x: number) => x,
      timeToIndex: () => 1,
      logicalToCoordinate: (logical: number) => logical,
    }),
  } as unknown as IChartApi

  const series = {
    priceToCoordinate: (price: number) => 100 - price,
    options: () => ({ visible: true }),
  } as unknown as ISeriesApi<SeriesType, Time>

  return { chart, series }
}

function buildContext(args: {
  chart: IChartApi
  series: ISeriesApi<SeriesType, Time>
  paneX: number
  paneY: number
  rectangleInstances?: readonly RectangleInstance[]
  lineInstances?: readonly LineInstance[]
}) {
  const bundle = {
    candle: args.series,
    emas: [],
    ema100: args.series,
    ema200: args.series,
    dailyVwap: null,
    weeklyVwap: null,
    monthlyVwap: null,
    quarterlyVwap: null,
    yearlyVwap: null,
    rollingVwaps: new Map(),
  } as ChartSeriesBundle

  return {
    chart: args.chart,
    series: args.series,
    paneX: args.paneX,
    paneY: args.paneY,
    interval: '1h' as const,
    intervalDurationSeconds: 3600,
    lastBarUnixTime: 200,
    activeIndicators: [],
    loadedVwapLevel: null,
    loadedVwapInterval: null,
    bundle,
    rectangleInteraction: INITIAL_RECTANGLE_INTERACTION_STATE,
    lineInteraction: INITIAL_LINE_INTERACTION_STATE,
    fixedRangeVolumeProfileInteraction: INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    rectangleInstances: args.rectangleInstances ?? [],
    lineInstances: args.lineInstances ?? [],
    fixedRangeVolumeProfileInstances: [],
    fixedRangeVolumeProfileRuntime: {},
    rollingVwapInstances: [],
  }
}

describe('hitTestChartObjectSettingsTarget', () => {
  it('returns rectangle and line targets for drawing hits', () => {
    const { chart, series } = createChartAndSeries()
    const rectangle: RectangleInstance = {
      id: 'rect-1',
      fromTime: 100,
      toTime: 200,
      lowPrice: 20,
      highPrice: 80,
    }
    const line: LineInstance = {
      id: 'line-1',
      timeA: 100,
      priceA: 50,
      timeB: 200,
      priceB: 50,
    }

    const rectangleTarget = hitTestChartObjectSettingsTarget(
      buildContext({
        chart,
        series,
        paneX: 150,
        paneY: 50,
        rectangleInstances: [rectangle],
      }),
    )
    assert.deepEqual(rectangleTarget, { kind: 'rectangle', instanceId: 'rect-1' })

    const lineTarget = hitTestChartObjectSettingsTarget(
      buildContext({
        chart,
        series,
        paneX: 150,
        paneY: 50,
        lineInstances: [line],
      }),
    )
    assert.deepEqual(lineTarget, { kind: 'line', instanceId: 'line-1' })
  })

  it('prefers line over rectangle when both hit at the same point', () => {
    const { chart, series } = createChartAndSeries()
    const rectangle: RectangleInstance = {
      id: 'rect-under',
      fromTime: 100,
      toTime: 200,
      lowPrice: 20,
      highPrice: 80,
    }
    const line: LineInstance = {
      id: 'line-over',
      timeA: 100,
      priceA: 50,
      timeB: 200,
      priceB: 50,
    }

    const target = hitTestChartObjectSettingsTarget(
      buildContext({
        chart,
        series,
        paneX: 150,
        paneY: 50,
        rectangleInstances: [rectangle],
        lineInstances: [line],
      }),
    )
    assert.deepEqual(target, { kind: 'line', instanceId: 'line-over' })
  })

  it('returns null for empty chart space and while drawing tools are active', () => {
    const { chart, series } = createChartAndSeries()
    assert.equal(
      hitTestChartObjectSettingsTarget(
        buildContext({ chart, series, paneX: 5, paneY: 5 }),
      ),
      null,
    )

    const blocked = buildContext({ chart, series, paneX: 150, paneY: 50 })
    blocked.rectangleInteraction = {
      phase: 'moving',
      selectedId: 'rect-1',
      draft: null,
    }
    assert.equal(hitTestChartObjectSettingsTarget(blocked), null)
  })
})
