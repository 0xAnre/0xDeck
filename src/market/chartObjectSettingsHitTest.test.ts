import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { hitTestChartObjectSettingsTarget } from './chartObjectSettingsHitTest.ts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'
import { INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE } from './anchoredVwapDrawingInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import type { LineInstance } from './lineInstances.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import { buildFixedRangeVolumeProfileRequestIdentityKey } from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'

function frvpInstance(
  overrides: Partial<FixedRangeVolumeProfileInstance> = {},
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-1',
    fromTime: 100,
    toTime: 200,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
    ...overrides,
  }
}

function frvpRuntime(
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileRuntimeSnapshot {
  const profile: FixedRangeVolumeProfileResult = {
    fromTime: instance.fromTime,
    toTime: instance.toTime - 1,
    candleCount: 1,
    profileLow: 20,
    profileHigh: 80,
    rowHeight: 60,
    rows: [
      {
        priceLow: 20,
        priceHigh: 80,
        upVolume: 5,
        downVolume: 5,
        totalVolume: 10,
        inValueArea: true,
      },
    ],
    totalVolume: 10,
    pocRowIndex: 0,
    pocPrice: 50,
    pocVolume: 10,
    vah: 70,
    val: 30,
    valueAreaVolume: 10,
    valueAreaPercentAchieved: 100,
  }
  return {
    [instance.id]: {
      status: 'ready',
      instanceId: instance.id,
      identityKey: buildFixedRangeVolumeProfileRequestIdentityKey(instance),
      requestStartTime: instance.fromTime,
      requestEndTime: instance.toTime,
      sourceInterval: '1m',
      profile,
      historyUnavailable: false,
      availableFrom: null,
      pipeline: {
        instanceId: instance.id,
        requestStartTime: instance.fromTime,
        requestEndTime: instance.toTime,
        sourceInterval: '1m',
        profile,
        historyUnavailable: false,
        availableFrom: null,
      },
    },
  }
}

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
  fixedRangeVolumeProfileInstances?: readonly FixedRangeVolumeProfileInstance[]
  fixedRangeVolumeProfileRuntime?: FixedRangeVolumeProfileRuntimeSnapshot
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
    anchoredVwaps: new Map(),
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
    fixedRangeVolumeProfileInstances: args.fixedRangeVolumeProfileInstances ?? [],
    fixedRangeVolumeProfileRuntime: args.fixedRangeVolumeProfileRuntime ?? {},
    rollingVwapInstances: [],
    anchoredVwapInstances: [],
    anchoredVwapDrawingInteraction: INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
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

  it('suppresses a stale FRVP profile after the committed range changes', () => {
    const { chart, series } = createChartAndSeries()
    const previous = frvpInstance({ fromTime: 100, toTime: 200 })
    const committed = { ...previous, toTime: 260 }
    const runtime = frvpRuntime(previous)

    const staleTarget = hitTestChartObjectSettingsTarget(
      buildContext({
        chart,
        series,
        paneX: 105,
        paneY: 50,
        fixedRangeVolumeProfileInstances: [committed],
        fixedRangeVolumeProfileRuntime: runtime,
      }),
    )
    assert.equal(staleTarget, null)

    const currentTarget = hitTestChartObjectSettingsTarget(
      buildContext({
        chart,
        series,
        paneX: 105,
        paneY: 50,
        fixedRangeVolumeProfileInstances: [previous],
        fixedRangeVolumeProfileRuntime: runtime,
      }),
    )
    assert.deepEqual(currentTarget, {
      kind: 'fixed-range-volume-profile',
      instanceId: previous.id,
    })
  })
})
