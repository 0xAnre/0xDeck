import { LineStyle, type ISeriesApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import type { MarketIndicatorId } from './indicators.ts'
import {
  DEFAULT_LINE_CHART_STROKE_STYLE,
  DEFAULT_LINE_CHART_STROKE_WIDTH,
  isLineChartStrokeWidth,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './lineChartStroke.ts'
import { resolveCssColor } from '../lib/resolveCssColor.ts'
import { MARKET_STYLE_DEFAULTS, isMarketStyleOpacityPercent } from './marketStylePalette.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import {
  VWAP_CHART_SERIES_KEYS,
  type VwapChartSeriesKey,
} from './vwapChartLineStyles.ts'
import type { SessionVwapLineSeriesBundle } from './sessionVwapChartSeries.ts'

const COLOR_INPUT_FALLBACK_HEX = MARKET_STYLE_DEFAULTS.primaryLine.color

function rgbStringToHex(color: string): string | null {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim())
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

export function chartLineStyleToStrokeStyle(lineStyle: LineStyle | undefined): LineChartStrokeStyle {
  switch (lineStyle) {
    case LineStyle.Dotted:
      return 'dotted'
    case LineStyle.Dashed:
      // `dashed` is retired: Lightweight Charts dashed series read as `solid`.
      return 'solid'
    case LineStyle.Solid:
    case undefined:
      return 'solid'
    default:
      return 'solid'
  }
}

export function readLineSeriesLineStyle(series: ISeriesApi<'Line'>): LineChartStrokeStyle {
  return chartLineStyleToStrokeStyle(series.options().lineStyle)
}

export function readLineSeriesLineWidth(series: ISeriesApi<'Line'>): LineChartStrokeWidth {
  const width = series.options().lineWidth
  if (isLineChartStrokeWidth(width)) {
    return width
  }
  return DEFAULT_LINE_CHART_STROKE_WIDTH
}

export function readMarketIndicatorSeriesLineWidths(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
): readonly LineChartStrokeWidth[] {
  switch (indicatorId) {
    case 'triple-ema':
      return bundle.emas.map((series) => readLineSeriesLineWidth(series))
    case 'dual-ema':
      return [readLineSeriesLineWidth(bundle.ema100), readLineSeriesLineWidth(bundle.ema200)]
    case 'daily-vwap':
      return [readLineSeriesLineWidth(bundle.dailyVwap.byKey.vwap)]
    case 'weekly-vwap':
      return [readLineSeriesLineWidth(bundle.weeklyVwap.byKey.vwap)]
    case 'monthly-vwap':
      return [readLineSeriesLineWidth(bundle.monthlyVwap.byKey.vwap)]
    case 'quarterly-vwap':
      return [readLineSeriesLineWidth(bundle.quarterlyVwap.byKey.vwap)]
    case 'yearly-vwap':
      return [readLineSeriesLineWidth(bundle.yearlyVwap.byKey.vwap)]
    case 'rolling-vwap': {
      const widths: LineChartStrokeWidth[] = []
      for (const chartBundle of bundle.rollingVwaps.values()) {
        widths.push(readLineSeriesLineWidth(chartBundle.center))
      }
      return widths
    }
    case 'rsi':
      return bundle.rsi ? [readLineSeriesLineWidth(bundle.rsi.series)] : []
    case 'aggregated-liquidations':
      return []
    default: {
      const unreachable: never = indicatorId
      return unreachable
    }
  }
}

export function readMarketIndicatorSeriesLineStyles(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
): readonly LineChartStrokeStyle[] {
  switch (indicatorId) {
    case 'triple-ema':
      return bundle.emas.map((series) => readLineSeriesLineStyle(series))
    case 'dual-ema':
      return [readLineSeriesLineStyle(bundle.ema100), readLineSeriesLineStyle(bundle.ema200)]
    case 'daily-vwap':
      return [readLineSeriesLineStyle(bundle.dailyVwap.byKey.vwap)]
    case 'weekly-vwap':
      return [readLineSeriesLineStyle(bundle.weeklyVwap.byKey.vwap)]
    case 'monthly-vwap':
      return [readLineSeriesLineStyle(bundle.monthlyVwap.byKey.vwap)]
    case 'quarterly-vwap':
      return [readLineSeriesLineStyle(bundle.quarterlyVwap.byKey.vwap)]
    case 'yearly-vwap':
      return [readLineSeriesLineStyle(bundle.yearlyVwap.byKey.vwap)]
    case 'rolling-vwap': {
      const styles: LineChartStrokeStyle[] = []
      for (const chartBundle of bundle.rollingVwaps.values()) {
        styles.push(readLineSeriesLineStyle(chartBundle.center))
      }
      return styles
    }
    case 'rsi':
      return bundle.rsi ? [readLineSeriesLineStyle(bundle.rsi.series)] : []
    case 'aggregated-liquidations':
      return []
    default: {
      const unreachable: never = indicatorId
      return unreachable
    }
  }
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
    case 'rsi':
      return bundle.rsi ? [readLineSeriesColorHex(bundle.rsi.series)] : []
    case 'aggregated-liquidations':
      return []
    default: {
      const unreachable: never = indicatorId
      return unreachable
    }
  }
}

/** Resolved per-line control values for the time-based VWAP settings dialog. */
export type SessionVwapSeriesStyleInput = {
  color: string
  opacityPercent: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
}

export type SessionVwapSeriesStyleInputs = Record<
  VwapChartSeriesKey,
  SessionVwapSeriesStyleInput
>

function sessionVwapLineBundle(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
): SessionVwapLineSeriesBundle<VwapChartSeriesKey> | null {
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

/** Flat presentation fields used until a per-series value is stored. */
function fallbackSeriesStyle(presentation: MarketIndicatorPresentation) {
  return {
    color: presentation.color
      ? cssColorToHexForColorInput(presentation.color)
      : undefined,
    opacityPercent: isMarketStyleOpacityPercent(presentation.opacity)
      ? presentation.opacity
      : undefined,
    lineWidth: presentation.lineWidth,
    lineStyle: presentation.lineStyle,
  }
}

/**
 * Per-line dialog inputs for the time-based VWAP center, upper and lower band
 * lines. Each field resolves per-series → flat presentation → live series, so
 * the dialog opens on exactly what the chart renders, including old settings
 * that only stored the flat record.
 */
/** Fallback dialog inputs when the live chart bundle is unavailable. */
export function sessionVwapSeriesStyleInputsFromFlat(
  style: SessionVwapSeriesStyleInput,
): SessionVwapSeriesStyleInputs {
  const inputs = {} as SessionVwapSeriesStyleInputs
  for (const key of VWAP_CHART_SERIES_KEYS) {
    inputs[key] = { ...style }
  }
  return inputs
}

export function readSessionVwapSeriesStyleInputs(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): SessionVwapSeriesStyleInputs | null {
  const lineBundle = sessionVwapLineBundle(bundle, indicatorId)
  if (!lineBundle) return null
  const fallback = fallbackSeriesStyle(presentation)
  const inputs = {} as SessionVwapSeriesStyleInputs
  for (const key of VWAP_CHART_SERIES_KEYS) {
    const series = lineBundle.byKey[key]
    if (!series) return null
    const stored = presentation.series?.[key]
    inputs[key] = {
      color:
        stored?.color !== undefined
          ? cssColorToHexForColorInput(stored.color)
          : fallback.color ?? readLineSeriesColorHex(series),
      opacityPercent:
        stored?.opacity ??
        fallback.opacityPercent ??
        MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent,
      lineWidth:
        stored?.lineWidth ?? fallback.lineWidth ?? readLineSeriesLineWidth(series),
      lineStyle:
        stored?.lineStyle ?? fallback.lineStyle ?? readLineSeriesLineStyle(series),
    }
  }
  return inputs
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

export function marketIndicatorLineWidthInputValue(
  presentationWidth: LineChartStrokeWidth | undefined,
  seriesWidths: readonly LineChartStrokeWidth[],
): LineChartStrokeWidth {
  if (presentationWidth !== undefined) {
    return presentationWidth
  }
  if (seriesWidths.length === 0) {
    return DEFAULT_LINE_CHART_STROKE_WIDTH
  }
  return seriesWidths[0]
}

export function marketIndicatorLineStyleSelectValue(
  presentationLineStyle: LineChartStrokeStyle | undefined,
  seriesLineStyles: readonly LineChartStrokeStyle[],
): LineChartStrokeStyle {
  if (presentationLineStyle !== undefined) {
    return presentationLineStyle
  }
  if (seriesLineStyles.length === 0) {
    return DEFAULT_LINE_CHART_STROKE_STYLE
  }
  return seriesLineStyles[0]
}

/** Indicator opacity control value (defaults to the palette primary line opacity). */
export function marketIndicatorOpacityInputValue(
  presentationOpacity: number | undefined,
): number {
  return isMarketStyleOpacityPercent(presentationOpacity)
    ? presentationOpacity
    : MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent
}

export function marketIndicatorUsesDistinctSeriesLineWidths(
  seriesWidths: readonly LineChartStrokeWidth[],
): boolean {
  if (seriesWidths.length <= 1) return false
  return new Set(seriesWidths).size > 1
}

export function marketIndicatorUsesDistinctSeriesLineStyles(
  seriesLineStyles: readonly LineChartStrokeStyle[],
): boolean {
  if (seriesLineStyles.length <= 1) return false
  return new Set(seriesLineStyles).size > 1
}
