import type { IChartApi, LogicalRange } from 'lightweight-charts'
import {
  computeInitialVisibleLogicalRange,
  MARKET_CHART_INITIAL_VISIBLE_BARS,
} from './chartInitialVisibleRange.ts'

export const MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS = {
  top: 0.1,
  bottom: 0.1,
} as const

export const MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 8

export type PersistedMarketChartViewport = {
  version: 1
  logicalRange: { from: number; to: number }
  autoScale: boolean
  priceRange: { from: number; to: number } | null
  scaleMargins: { top: number; bottom: number }
  rightOffset: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidScaleMargins(margins: { top: number; bottom: number }): boolean {
  const { top, bottom } = margins
  if (!isFiniteNumber(top) || !isFiniteNumber(bottom)) return false
  if (top < 0 || bottom < 0 || top >= 1 || bottom >= 1) return false
  return top + bottom < 1
}

export function parsePersistedMarketChartViewport(
  value: unknown,
): PersistedMarketChartViewport | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.version !== 1) return null

  const logicalRaw = record.logicalRange
  if (!logicalRaw || typeof logicalRaw !== 'object') return null
  const logical = logicalRaw as Record<string, unknown>
  if (!isFiniteNumber(logical.from) || !isFiniteNumber(logical.to)) return null
  if (logical.from >= logical.to) return null

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
    logicalRange: { from: logical.from, to: logical.to },
    autoScale: record.autoScale,
    priceRange,
    scaleMargins,
    rightOffset: record.rightOffset,
  }
}

export function captureMarketChartViewport(chart: IChartApi): PersistedMarketChartViewport | null {
  const logicalRange = chart.timeScale().getVisibleLogicalRange()
  if (!logicalRange) return null
  const from = logicalRange.from as number
  const to = logicalRange.to as number
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null

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
    logicalRange: { from, to },
    autoScale,
    priceRange,
    scaleMargins,
    rightOffset,
  }
}

function logicalRangeIsPlausible(
  range: { from: number; to: number },
  barCount: number,
): boolean {
  if (barCount <= 0) return false
  const maxIndex = barCount - 1
  const span = range.to - range.from
  if (span <= 0) return false
  if (range.to < -barCount || range.from > maxIndex + barCount) return false
  return true
}

export function applyDefaultMarketChartPresentation(chart: IChartApi, barCount: number): void {
  chart.priceScale('right').applyOptions({
    autoScale: true,
    scaleMargins: {
      top: MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS.top,
      bottom: MARKET_CHART_DEFAULT_PRICE_SCALE_MARGINS.bottom,
    },
  })
  chart.timeScale().applyOptions({
    rightOffset: MARKET_CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
  })

  const initialRange = computeInitialVisibleLogicalRange(barCount)
  if (initialRange) {
    chart.timeScale().setVisibleLogicalRange(initialRange)
  }
}

export function restoreMarketChartViewport(
  chart: IChartApi,
  viewport: PersistedMarketChartViewport,
  barCount: number,
): boolean {
  const parsed = parsePersistedMarketChartViewport(viewport)
  if (!parsed) return false
  if (!logicalRangeIsPlausible(parsed.logicalRange, barCount)) return false

  chart.timeScale().applyOptions({ rightOffset: parsed.rightOffset })
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

  chart.timeScale().setVisibleLogicalRange(parsed.logicalRange as LogicalRange)
  return true
}

export { MARKET_CHART_INITIAL_VISIBLE_BARS }
