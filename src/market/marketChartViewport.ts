import type { IChartApi, Time } from 'lightweight-charts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'
import {
  computeInitialVisibleLogicalRange,
  MARKET_CHART_INITIAL_VISIBLE_BARS,
} from './chartInitialVisibleRange.ts'
import type { MarketCandle } from './types.ts'

export const MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS = {
  top: 0.1,
  bottom: 0.1,
} as const

export const MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 8

export type PersistedMarketChartViewport = {
  version: 1
  visibleTimeRange: { from: number; to: number }
  autoScale: boolean
  priceRange: { from: number; to: number } | null
  scaleMargins: { top: number; bottom: number }
  rightOffset: number
}

export type RestoreMarketChartViewportResult = 'restored' | 'needs_history' | 'invalid'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidScaleMargins(margins: { top: number; bottom: number }): boolean {
  const { top, bottom } = margins
  if (!isFiniteNumber(top) || !isFiniteNumber(bottom)) return false
  if (top < 0 || bottom < 0 || top >= 1 || bottom >= 1) return false
  return top + bottom < 1
}

function parseVisibleTimeRange(value: unknown): { from: number; to: number } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isFiniteNumber(record.from) || !isFiniteNumber(record.to)) return null
  const from = Math.trunc(record.from)
  const to = Math.trunc(record.to)
  if (!isValidUnixChartTimeSeconds(from) || !isValidUnixChartTimeSeconds(to)) return null
  if (from >= to) return null
  return { from, to }
}

export function parsePersistedMarketChartViewport(
  value: unknown,
): PersistedMarketChartViewport | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.version !== 1) return null

  const visibleTimeRange = parseVisibleTimeRange(record.visibleTimeRange)
  if (!visibleTimeRange) return null

  if (typeof record.autoScale !== 'boolean') return null

  let priceRange: { from: number; to: number } | null = null
  if (record.priceRange !== null && record.priceRange !== undefined) {
    if (typeof record.priceRange !== 'object') return null
    const price = record.priceRange as Record<string, unknown>
    if (!isFiniteNumber(price.from) || !isFiniteNumber(price.to)) return null
    if (price.from >= price.to) return null
    priceRange = { from: price.from, to: price.to }
  }

  const marginsRaw = record.scaleMargins
  if (!marginsRaw || typeof marginsRaw !== 'object') return null
  const margins = marginsRaw as Record<string, unknown>
  if (!isFiniteNumber(margins.top) || !isFiniteNumber(margins.bottom)) return null
  const scaleMargins = { top: margins.top, bottom: margins.bottom }
  if (!isValidScaleMargins(scaleMargins)) return null

  if (!isFiniteNumber(record.rightOffset) || record.rightOffset < 0) return null

  if (!record.autoScale && priceRange === null) return null

  return {
    version: 1,
    visibleTimeRange,
    autoScale: record.autoScale,
    priceRange,
    scaleMargins,
    rightOffset: record.rightOffset,
  }
}

export function captureMarketChartViewport(chart: IChartApi): PersistedMarketChartViewport | null {
  const visibleTimeRange = chart.timeScale().getVisibleRange()
  if (!visibleTimeRange) return null
  const from = visibleTimeRange.from as number
  const to = visibleTimeRange.to as number
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null
  const truncated = parseVisibleTimeRange({ from, to })
  if (!truncated) return null

  const priceScale = chart.priceScale('right')
  const options = priceScale.options()
  const autoScale = options.autoScale
  const scaleMargins = {
    top: options.scaleMargins.top,
    bottom: options.scaleMargins.bottom,
  }
  if (!isValidScaleMargins(scaleMargins)) return null

  const timeScaleOptions = chart.timeScale().options()
  const rightOffset = timeScaleOptions.rightOffset

  let priceRange: { from: number; to: number } | null = null
  if (!autoScale) {
    const visible = priceScale.getVisibleRange()
    if (!visible) return null
    if (!Number.isFinite(visible.from) || !Number.isFinite(visible.to)) return null
    if (visible.from >= visible.to) return null
    priceRange = { from: visible.from, to: visible.to }
  }

  return {
    version: 1,
    visibleTimeRange: truncated,
    autoScale,
    priceRange,
    scaleMargins,
    rightOffset,
  }
}

export function visibleTimeRangeOverlapsLoadedCandles(
  range: { from: number; to: number },
  candles: readonly MarketCandle[],
): boolean {
  if (candles.length === 0) return false
  const first = candles[0].time
  const last = candles[candles.length - 1].time
  if (range.to < first) return false
  if (range.from > last) return false
  return true
}

export function visibleTimeRangeNeedsOlderHistory(
  range: { from: number; to: number },
  candles: readonly MarketCandle[],
): boolean {
  if (candles.length === 0) return false
  return range.from < candles[0].time
}

function applyViewportPresentationOptions(
  chart: IChartApi,
  parsed: PersistedMarketChartViewport,
): void {
  chart.priceScale('right').applyOptions({
    scaleMargins: {
      top: parsed.scaleMargins.top,
      bottom: parsed.scaleMargins.bottom,
    },
  })

  chart.priceScale('right').setAutoScale(parsed.autoScale)
  if (!parsed.autoScale && parsed.priceRange) {
    chart.priceScale('right').setVisibleRange(parsed.priceRange)
  }
}

export function applyDefaultMarketChartPresentation(chart: IChartApi, barCount: number): void {
  chart.priceScale('right').applyOptions({
    autoScale: true,
    scaleMargins: {
      top: MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS.top,
      bottom: MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS.bottom,
    },
  })

  const initialRange = computeInitialVisibleLogicalRange(barCount)
  if (initialRange) {
    chart.timeScale().setVisibleLogicalRange(initialRange)
  }

  chart.timeScale().applyOptions({
    rightOffset: MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
  })
}

export function restoreMarketChartViewport(
  chart: IChartApi,
  viewport: PersistedMarketChartViewport,
  candles: readonly MarketCandle[],
): RestoreMarketChartViewportResult {
  const parsed = parsePersistedMarketChartViewport(viewport)
  if (!parsed) return 'invalid'
  if (!visibleTimeRangeOverlapsLoadedCandles(parsed.visibleTimeRange, candles)) {
    return 'invalid'
  }

  applyViewportPresentationOptions(chart, parsed)

  if (visibleTimeRangeNeedsOlderHistory(parsed.visibleTimeRange, candles)) {
    return 'needs_history'
  }

  chart.timeScale().setVisibleRange(parsed.visibleTimeRange as IRangeTime)
  chart.timeScale().applyOptions({ rightOffset: parsed.rightOffset })
  return 'restored'
}

type IRangeTime = { from: Time; to: Time }

export function applySavedVisibleTimeRange(
  chart: IChartApi,
  visibleTimeRange: { from: number; to: number },
  rightOffset: number,
): void {
  chart.timeScale().setVisibleRange(visibleTimeRange as IRangeTime)
  chart.timeScale().applyOptions({ rightOffset })
}

export { MARKET_CHART_INITIAL_VISIBLE_BARS }
