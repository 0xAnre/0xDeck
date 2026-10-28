import type { LineSeriesPartialOptions } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  MARKET_INDICATOR_IDS,
  marketIndicatorSupportsBandFill,
  type MarketIndicatorId,
} from './indicators.ts'
import { readMarketIndicatorSeriesColors } from './marketIndicatorSeriesColors.ts'
import { lineChartStrokeStyleToChartLineStyle } from './lineChartStroke.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import { loadWidgetMarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import { marketStyleColorWithOpacity } from './marketStylePalette.ts'
import { resolveSessionVwapBandFillStyle } from './sessionVwapBandFillStyle.ts'
import { VWAP_CHART_SERIES_KEYS } from './vwapChartLineStyles.ts'
import type { SessionVwapLineSeriesBundle } from './sessionVwapChartSeries.ts'
import type { VwapChartSeriesKey } from './vwapChartLineStyles.ts'

export function marketIndicatorPresentationLineOptions(
  presentation: MarketIndicatorPresentation,
): LineSeriesPartialOptions {
  const options: LineSeriesPartialOptions = {}
  if (presentation.color) {
    options.color = marketStyleColorWithOpacity(
      presentation.color,
      presentation.opacity ?? 100,
    )
  }
  if (presentation.lineWidth !== undefined) {
    options.lineWidth = presentation.lineWidth
  }
  if (presentation.lineStyle !== undefined) {
    options.lineStyle = lineChartStrokeStyleToChartLineStyle(presentation.lineStyle)
  }
  return options
}

export function resolveMarketIndicatorSeriesColor(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
): string | undefined {
  const colors = readMarketIndicatorSeriesColors(bundle, indicatorId)
  return colors[0]
}

function hasLinePresentationOverrides(presentation: MarketIndicatorPresentation): boolean {
  return (
    presentation.color !== undefined ||
    presentation.opacity !== undefined ||
    presentation.lineWidth !== undefined ||
    presentation.lineStyle !== undefined
  )
}

/**
 * Background fill for the time-based VWAP band primitive. Fill fields are
 * independent from line fields, so this also restores the palette default when
 * a stored presentation carries no fill overrides.
 */
function applySessionVwapBandFillPresentation(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): void {
  if (!marketIndicatorSupportsBandFill(indicatorId)) return
  const fillStyle = resolveSessionVwapBandFillStyle(presentation)
  switch (indicatorId) {
    case 'daily-vwap':
      bundle.dailyVwap.band.setFillStyle(fillStyle)
      return
    case 'weekly-vwap':
      bundle.weeklyVwap.band.setFillStyle(fillStyle)
      return
    case 'monthly-vwap':
      bundle.monthlyVwap.band.setFillStyle(fillStyle)
      return
    case 'quarterly-vwap':
      bundle.quarterlyVwap.band.setFillStyle(fillStyle)
      return
    case 'yearly-vwap':
      bundle.yearlyVwap.band.setFillStyle(fillStyle)
      return
    default:
      return
  }
}

/** Minimal line-series surface used to apply presentation options. */
type PresentationLineSeries = {
  applyOptions: (options: LineSeriesPartialOptions) => void
  options?: () => LineSeriesPartialOptions
}

function readSeriesColor(series: PresentationLineSeries): string | undefined {
  const options = typeof series.options === 'function' ? series.options() : undefined
  const color = options?.color
  return typeof color === 'string' ? color : undefined
}

/**
 * Presentation options for one series. Without an explicit presentation color,
 * an opacity-only change keeps each series' own color and folds the opacity in.
 */
function presentationOptionsForSeries(
  series: PresentationLineSeries,
  presentation: MarketIndicatorPresentation,
): LineSeriesPartialOptions {
  const options = marketIndicatorPresentationLineOptions(presentation)
  if (presentation.opacity !== undefined && presentation.color === undefined) {
    const baseColor = readSeriesColor(series)
    if (baseColor) {
      options.color = marketStyleColorWithOpacity(baseColor, presentation.opacity)
    }
  }
  return options
}

function applyPresentationToOrderedLineSeries(
  ordered: readonly PresentationLineSeries[],
  presentation: MarketIndicatorPresentation,
): void {
  for (const series of ordered) {
    series.applyOptions(presentationOptionsForSeries(series, presentation))
  }
}

/**
 * Time-based VWAP only: applies one style per rendered line (center VWAP,
 * previous-session upper/lower band). A stored per-series field wins; otherwise
 * the flat record remains the fallback for that field, so pre-#192 settings
 * still style all three lines exactly as before.
 */
function applySessionVwapSeriesPresentation(
  lineBundle: SessionVwapLineSeriesBundle<VwapChartSeriesKey>,
  presentation: MarketIndicatorPresentation,
): void {
  const hasSeriesOverrides =
    presentation.series !== undefined && Object.keys(presentation.series).length > 0
  if (!hasLinePresentationOverrides(presentation) && !hasSeriesOverrides) return
  for (const key of VWAP_CHART_SERIES_KEYS) {
    const series = lineBundle.byKey[key]
    if (!series) continue
    const seriesStyle = presentation.series?.[key]
    const resolved: MarketIndicatorPresentation = {
      color: seriesStyle?.color ?? presentation.color,
      opacity: seriesStyle?.opacity ?? presentation.opacity,
      lineWidth: seriesStyle?.lineWidth ?? presentation.lineWidth,
      lineStyle: seriesStyle?.lineStyle ?? presentation.lineStyle,
    }
    if (
      resolved.color === undefined &&
      resolved.opacity === undefined &&
      resolved.lineWidth === undefined &&
      resolved.lineStyle === undefined
    ) {
      continue
    }
    series.applyOptions(presentationOptionsForSeries(series, resolved))
  }
}

export function applyMarketIndicatorPresentationToBundle(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): void {
  applySessionVwapBandFillPresentation(bundle, indicatorId, presentation)

  switch (indicatorId) {
    case 'daily-vwap':
      applySessionVwapSeriesPresentation(bundle.dailyVwap, presentation)
      return
    case 'weekly-vwap':
      applySessionVwapSeriesPresentation(bundle.weeklyVwap, presentation)
      return
    case 'monthly-vwap':
      applySessionVwapSeriesPresentation(bundle.monthlyVwap, presentation)
      return
    case 'quarterly-vwap':
      applySessionVwapSeriesPresentation(bundle.quarterlyVwap, presentation)
      return
    case 'yearly-vwap':
      applySessionVwapSeriesPresentation(bundle.yearlyVwap, presentation)
      return
    default:
      break
  }

  if (!hasLinePresentationOverrides(presentation)) return

  switch (indicatorId) {
    case 'triple-ema':
      applyPresentationToOrderedLineSeries(bundle.emas, presentation)
      return
    case 'dual-ema':
      applyPresentationToOrderedLineSeries([bundle.ema100, bundle.ema200], presentation)
      return
    case 'rolling-vwap':
      // Rolling VWAP presentation is owned by per-instance settings
      // (`0xdeck-widget-rolling-vwap-instances`). The legacy global entry is
      // migrated into those settings and must never influence rendering.
      return
    case 'rsi':
      if (bundle.rsi) {
        bundle.rsi.series.applyOptions(
          presentationOptionsForSeries(bundle.rsi.series, presentation),
        )
      }
      return
    case 'aggregated-liquidations':
      // The liquidation pane owns fixed long/short colors, not line styles.
      return
    default: {
      const unreachable: never = indicatorId
      return unreachable
    }
  }
}

export function syncWidgetMarketIndicatorPresentations(
  panelId: string,
  bundle: ChartSeriesBundle,
): void {
  for (const indicatorId of MARKET_INDICATOR_IDS) {
    // Skip Rolling VWAP: instances own its presentation, so a stale legacy entry
    // must not override the per-instance settings applied by the chart panel.
    if (indicatorId === 'rolling-vwap') continue
    const presentation = loadWidgetMarketIndicatorPresentation(panelId, indicatorId)
    applyMarketIndicatorPresentationToBundle(bundle, indicatorId, presentation)
  }
}
