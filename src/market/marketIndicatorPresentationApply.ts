import { LineStyle, type LineSeriesPartialOptions } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { MARKET_INDICATOR_IDS, type MarketIndicatorId } from './indicators.ts'
import { readMarketIndicatorSeriesColors } from './marketIndicatorSeriesColors.ts'
import type { LineChartStrokeStyle } from './lineChartStroke.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import { loadWidgetMarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import { marketStyleColorWithOpacity } from './marketStylePalette.ts'

function lineChartStrokeStyleToLineStyle(style: LineChartStrokeStyle): LineStyle {
  switch (style) {
    case 'solid':
      return LineStyle.Solid
    case 'dotted':
      return LineStyle.Dotted
    default: {
      const unreachable: never = style
      return unreachable
    }
  }
}

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
    options.lineStyle = lineChartStrokeStyleToLineStyle(presentation.lineStyle)
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

function hasPresentationOverrides(presentation: MarketIndicatorPresentation): boolean {
  return (
    presentation.color !== undefined ||
    presentation.opacity !== undefined ||
    presentation.lineWidth !== undefined ||
    presentation.lineStyle !== undefined
  )
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

export function applyMarketIndicatorPresentationToBundle(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): void {
  if (!hasPresentationOverrides(presentation)) return

  switch (indicatorId) {
    case 'triple-ema':
      applyPresentationToOrderedLineSeries(bundle.emas, presentation)
      return
    case 'dual-ema':
      applyPresentationToOrderedLineSeries([bundle.ema100, bundle.ema200], presentation)
      return
    case 'daily-vwap':
      applyPresentationToOrderedLineSeries(bundle.dailyVwap.ordered, presentation)
      return
    case 'weekly-vwap':
      applyPresentationToOrderedLineSeries(bundle.weeklyVwap.ordered, presentation)
      return
    case 'monthly-vwap':
      applyPresentationToOrderedLineSeries(bundle.monthlyVwap.ordered, presentation)
      return
    case 'quarterly-vwap':
      applyPresentationToOrderedLineSeries(bundle.quarterlyVwap.ordered, presentation)
      return
    case 'yearly-vwap':
      applyPresentationToOrderedLineSeries(bundle.yearlyVwap.ordered, presentation)
      return
    case 'rolling-vwap':
      for (const chartBundle of bundle.rollingVwaps.values()) {
        chartBundle.center.applyOptions(
          presentationOptionsForSeries(chartBundle.center, presentation),
        )
      }
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
    const presentation = loadWidgetMarketIndicatorPresentation(panelId, indicatorId)
    applyMarketIndicatorPresentationToBundle(bundle, indicatorId, presentation)
  }
}
