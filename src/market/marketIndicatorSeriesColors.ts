import type { ISeriesApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import type { MarketIndicatorId } from './indicators.ts'
import { resolveCssColor } from '../lib/resolveCssColor.ts'

const COLOR_INPUT_FALLBACK_HEX = '#71717a'

function rgbStringToHex(color: string): string | null {
  const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color.trim())
  if (!match) return null
  const toHex = (n: string) => Number(n).toString(16).padStart(2, '0')
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`
}

export function cssColorToHexForColorInput(color: string): string {
  const trimmed = color.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const expanded = trimmed
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')
    return `#${expanded}`
  }
  const fromRgb = rgbStringToHex(trimmed)
  if (fromRgb) return fromRgb
  const resolved = resolveCssColor(trimmed, COLOR_INPUT_FALLBACK_HEX)
  const fromResolvedRgb = rgbStringToHex(resolved)
  if (fromResolvedRgb) return fromResolvedRgb
  if (/^#[0-9A-Fa-f]{6}$/.test(resolved)) return resolved
  return COLOR_INPUT_FALLBACK_HEX
}

export function readLineSeriesColorHex(series: ISeriesApi<'Line'>): string {
  const color = series.options().color
  if (!color || typeof color !== 'string') {
    return COLOR_INPUT_FALLBACK_HEX
  }
  return cssColorToHexForColorInput(color)
}

export function readMarketIndicatorSeriesColors(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
): readonly string[] {
  switch (indicatorId) {
    case 'triple-ema':
      return bundle.emas.map((series) => readLineSeriesColorHex(series))
    case 'dual-ema':
      return [readLineSeriesColorHex(bundle.ema100), readLineSeriesColorHex(bundle.ema200)]
    case 'daily-vwap':
      return [readLineSeriesColorHex(bundle.dailyVwap.byKey.vwap)]
    case 'weekly-vwap':
      return [readLineSeriesColorHex(bundle.weeklyVwap.byKey.vwap)]
    case 'monthly-vwap':
      return [readLineSeriesColorHex(bundle.monthlyVwap.byKey.vwap)]
    case 'quarterly-vwap':
      return [readLineSeriesColorHex(bundle.quarterlyVwap.byKey.vwap)]
    case 'yearly-vwap':
      return [readLineSeriesColorHex(bundle.yearlyVwap.byKey.vwap)]
    case 'rolling-vwap': {
      const colors: string[] = []
      for (const chartBundle of bundle.rollingVwaps.values()) {
        colors.push(readLineSeriesColorHex(chartBundle.center))
      }
      return colors
    }
    default: {
      const unreachable: never = indicatorId
      return unreachable
    }
  }
}

export function marketIndicatorColorInputValue(
  presentationColor: string | undefined,
  seriesColors: readonly string[],
): string {
  if (presentationColor) {
    return cssColorToHexForColorInput(presentationColor)
  }
  if (seriesColors.length === 0) {
    return COLOR_INPUT_FALLBACK_HEX
  }
  return seriesColors[0]
}

export function marketIndicatorUsesDistinctSeriesColors(seriesColors: readonly string[]): boolean {
  if (seriesColors.length <= 1) return false
  const normalized = seriesColors.map((color) => cssColorToHexForColorInput(color))
  return new Set(normalized).size > 1
}
