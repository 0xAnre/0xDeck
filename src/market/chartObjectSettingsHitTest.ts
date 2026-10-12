import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { frvpDefaultDrawStyle, frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import {
  buildFixedRangeVolumeProfileDrawModels,
  type FixedRangeVolumeProfileInstanceDrawModel,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import { buildFixedRangeVolumeProfileTimeCoordinateResolvers } from './fixedRangeVolumeProfileTimeCoordinates.ts'
import type { ChartObjectSettingsTarget } from './chartObjectSettingsTypes.ts'
import { hitTestLineSeriesAtPane } from './chartObjectSeriesLineHit.ts'
import {
  isIndicatorSupportedOnInterval,
  MARKET_INDICATOR_IDS,
  shouldShowVwapIndicatorSeries,
  type MarketIndicatorId,
  type VwapContextLevel,
} from './indicators.ts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import type { SessionVwapLineSeriesBundle } from './sessionVwapChartSeries.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval } from './types.ts'
import {
  lineHitAtPanePoint,
  preferDrawingPointerTarget,
  rectangleHitAtPanePoint,
} from './drawingPointerArbitration.ts'
import type { LineInteractionState } from './lineInteraction.ts'
import type { LineInstance } from './lineInstances.ts'
import type { RectangleInteractionState } from './rectangleInteraction.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import { isFixedRangeVolumeProfileToolActive } from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'

const FRVP_HIT_TOLERANCE_PX = 4

export type ChartObjectSettingsHitTestContext = {
  chart: IChartApi
  series: ISeriesApi<SeriesType, Time>
  paneX: number
  paneY: number
  interval: CandleInterval
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
  activeIndicators: readonly MarketIndicatorId[]
  loadedVwapLevel: VwapContextLevel | null
  loadedVwapInterval: CandleInterval | null
  bundle: ChartSeriesBundle
  rectangleInteraction: RectangleInteractionState
  lineInteraction: LineInteractionState
  fixedRangeVolumeProfileInteraction: FixedRangeVolumeProfileInteractionState
  rectangleInstances: readonly RectangleInstance[]
  lineInstances: readonly LineInstance[]
  fixedRangeVolumeProfileInstances: readonly FixedRangeVolumeProfileInstance[]
  fixedRangeVolumeProfileRuntime: FixedRangeVolumeProfileRuntimeSnapshot
  rollingVwapInstances: readonly RollingVwapInstance[]
}

function chartObjectSettingsHitTestBlocked(ctx: ChartObjectSettingsHitTestContext): boolean {
  if (ctx.rectangleInteraction.phase !== 'inactive') return true
  if (ctx.lineInteraction.phase !== 'inactive') return true
  if (isFixedRangeVolumeProfileToolActive(ctx.fixedRangeVolumeProfileInteraction)) return true
  if (ctx.fixedRangeVolumeProfileInteraction.phase === 'resizing') return true
  return false
}

function hitTestFixedRangeVolumeProfileModel(
  model: FixedRangeVolumeProfileInstanceDrawModel,
  paneX: number,
  paneY: number,
  tolerancePx: number,
): boolean {
  if (paneX < model.rangeLeft - tolerancePx || paneX > model.rangeRight + tolerancePx) {
    return false
  }

  for (const row of model.rows) {
    if (paneY < row.top - tolerancePx || paneY > row.bottom + tolerancePx) continue
    const barRight = row.left + row.totalWidth
    if (paneX >= row.left - tolerancePx && paneX <= barRight + tolerancePx) {
      return true
    }
  }

  for (const line of model.lines) {
    if (Math.abs(paneY - line.y) > tolerancePx) continue
    if (paneX >= line.x1 - tolerancePx && paneX <= line.x2 + tolerancePx) {
      return true
    }
  }

  return false
}

function buildFrvpReadyById(
  runtime: FixedRangeVolumeProfileRuntimeSnapshot,
): Map<string, { profile: FixedRangeVolumeProfileResult }> {
  const readyById = new Map<string, { profile: FixedRangeVolumeProfileResult }>()
  for (const [id, state] of Object.entries(runtime)) {
    if (state.status === 'ready') {
      readyById.set(id, { profile: state.profile })
    }
  }
  return readyById
}

function hitTestFixedRangeVolumeProfiles(
  ctx: ChartObjectSettingsHitTestContext,
): ChartObjectSettingsTarget | null {
  const timeScale = ctx.chart.timeScale()
  const barSpacing = timeScale.options().barSpacing
  const { fromTimeToCoordinate, toTimeToCoordinate } =
    buildFixedRangeVolumeProfileTimeCoordinateResolvers(
      ctx.chart,
      ctx.lastBarUnixTime,
      ctx.intervalDurationSeconds,
    )
  const instanceById = new Map(ctx.fixedRangeVolumeProfileInstances.map((item) => [item.id, item]))
  const models = buildFixedRangeVolumeProfileDrawModels({
    instances: ctx.fixedRangeVolumeProfileInstances,
    selectedId: ctx.fixedRangeVolumeProfileInteraction.selectedId,
    readyById: buildFrvpReadyById(ctx.fixedRangeVolumeProfileRuntime),
    fromTimeToCoordinate,
    toTimeToCoordinate,
    barSpacing,
    priceToY: (price) => ctx.series.priceToCoordinate(price),
    styleForInstance: (instanceId) => {
      const instance = instanceById.get(instanceId)
      return instance ? frvpDrawStyleForInstance(instance) : frvpDefaultDrawStyle()
    },
  })

  for (let index = models.length - 1; index >= 0; index -= 1) {
    const model = models[index]
    if (hitTestFixedRangeVolumeProfileModel(model, ctx.paneX, ctx.paneY, FRVP_HIT_TOLERANCE_PX)) {
      return { kind: 'fixed-range-volume-profile', instanceId: model.instanceId }
    }
  }
  return null
}

function singletonVwapSeriesBundle(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
): SessionVwapLineSeriesBundle<string> | null {
  switch (indicatorId) {
    case 'daily-vwap':
      return bundle.dailyVwap
    case 'weekly-vwap':
      return bundle.weeklyVwap
    case 'monthly-vwap':
      return bundle.monthlyVwap
    case 'quarterly-vwap':
      return bundle.quarterlyVwap
    case 'yearly-vwap':
      return bundle.yearlyVwap
    default:
      return null
  }
}

function hitTestRollingVwapInstances(
  ctx: ChartObjectSettingsHitTestContext,
): ChartObjectSettingsTarget | null {
  for (let index = ctx.rollingVwapInstances.length - 1; index >= 0; index -= 1) {
    const instance = ctx.rollingVwapInstances[index]
    if (!instance.enabled) continue
    const chartBundle = ctx.bundle.rollingVwaps.get(instance.id)
    if (!chartBundle) continue
    for (const series of chartBundle.ordered) {
      if (hitTestLineSeriesAtPane(ctx.chart, series, ctx.paneX, ctx.paneY)) {
        return { kind: 'rolling-vwap', instanceId: instance.id }
      }
    }
  }
  return null
}

function hitTestSingletonMarketIndicators(
  ctx: ChartObjectSettingsHitTestContext,
): ChartObjectSettingsTarget | null {
  const candidates: Array<{ indicatorId: MarketIndicatorId; series: ISeriesApi<'Line', Time> }> =
    []

  if (ctx.activeIndicators.includes('triple-ema')) {
    ctx.bundle.emas.forEach((series) => {
      candidates.push({ indicatorId: 'triple-ema', series })
    })
  }

  if (ctx.activeIndicators.includes('dual-ema')) {
    candidates.push({ indicatorId: 'dual-ema', series: ctx.bundle.ema100 })
    candidates.push({ indicatorId: 'dual-ema', series: ctx.bundle.ema200 })
  }

  for (const indicatorId of MARKET_INDICATOR_IDS) {
    if (indicatorId === 'triple-ema' || indicatorId === 'dual-ema' || indicatorId === 'rolling-vwap') {
      continue
    }
    if (!ctx.activeIndicators.includes(indicatorId)) continue
    if (!isIndicatorSupportedOnInterval(indicatorId, ctx.interval)) continue
    if (
      !shouldShowVwapIndicatorSeries({
        indicatorId,
        indicatorSelected: true,
        interval: ctx.interval,
        loadedLevel: ctx.loadedVwapLevel,
        loadedInterval: ctx.loadedVwapInterval,
      })
    ) {
      continue
    }
    const vwapBundle = singletonVwapSeriesBundle(ctx.bundle, indicatorId)
    if (!vwapBundle) continue
    for (const series of vwapBundle.ordered) {
      candidates.push({ indicatorId, series })
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]
    if (hitTestLineSeriesAtPane(ctx.chart, candidate.series, ctx.paneX, ctx.paneY)) {
      return { kind: 'market-indicator', indicatorId: candidate.indicatorId }
    }
  }

  return null
}

export function hitTestChartObjectSettingsTarget(
  ctx: ChartObjectSettingsHitTestContext,
): ChartObjectSettingsTarget | null {
  if (chartObjectSettingsHitTestBlocked(ctx)) return null

  const paneHitArgs = {
    chart: ctx.chart,
    series: ctx.series,
    paneX: ctx.paneX,
    paneY: ctx.paneY,
    intervalDurationSeconds: ctx.intervalDurationSeconds,
    lastBarUnixTime: ctx.lastBarUnixTime,
  }

  const lineHit = lineHitAtPanePoint({
    ...paneHitArgs,
    instances: ctx.lineInstances,
    selectedId: ctx.lineInteraction.selectedId,
  })
  const rectangleHit = rectangleHitAtPanePoint({
    ...paneHitArgs,
    instances: ctx.rectangleInstances,
    selectedId: ctx.rectangleInteraction.selectedId,
  })
  const preferredDrawing = preferDrawingPointerTarget(lineHit, rectangleHit)
  if (preferredDrawing === 'line' && lineHit) {
    return { kind: 'line', instanceId: lineHit.instanceId }
  }
  if (preferredDrawing === 'rectangle' && rectangleHit) {
    return { kind: 'rectangle', instanceId: rectangleHit.instanceId }
  }

  const frvp = hitTestFixedRangeVolumeProfiles(ctx)
  if (frvp) return frvp

  const rolling = hitTestRollingVwapInstances(ctx)
  if (rolling) return rolling

  return hitTestSingletonMarketIndicators(ctx)
}
