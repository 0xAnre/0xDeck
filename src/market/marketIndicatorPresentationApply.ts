import { LineStyle, type LineSeriesPartialOptions } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { MARKET_INDICATOR_IDS, type MarketIndicatorId } from './indicators.ts'
import {
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './lineChartStroke.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import { loadWidgetMarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'

function lineChartStrokeStyleToLineStyle(style: LineChartStrokeStyle): LineStyle {
  switch (style) {
    case 'solid':
      return LineStyle.Solid
    case 'dashed':
      return LineStyle.Dashed
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
    options.color = presentation.color
  }
  if (presentation.lineWidth !== undefined) {
    options.lineWidth = presentation.lineWidth as LineChartStrokeWidth
  }
  if (presentation.lineStyle !== undefined) {
    options.lineStyle = lineChartStrokeStyleToLineStyle(presentation.lineStyle)
  }
  return options
}

function hasPresentationOverrides(presentation: MarketIndicatorPresentation): boolean {
  return (
    presentation.color !== undefined ||
    presentation.lineWidth !== undefined ||
    presentation.lineStyle !== undefined
  )
}

export function applyMarketIndicatorPresentationToBundle(
  bundle: ChartSeriesBundle,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): void {
  if (!hasPresentationOverrides(presentation)) return
  const options = marketIndicatorPresentationLineOptions(presentation)

  switch (indicatorId) {
    case 'triple-ema':
      for (const series of bundle.emas) {
        series.applyOptions(options)
      }
      return
    case 'dual-ema':
      bundle.ema100.applyOptions(options)
      bundle.ema200.applyOptions(options)
      return
    case 'daily-vwap':
      bundle.dailyVwap.byKey.vwap.applyOptions(options)
      return
    case 'weekly-vwap':
      bundle.weeklyVwap.byKey.vwap.applyOptions(options)
      return
    case 'monthly-vwap':
      bundle.monthlyVwap.byKey.vwap.applyOptions(options)
      return
    case 'quarterly-vwap':
      bundle.quarterlyVwap.byKey.vwap.applyOptions(options)
      return
    case 'yearly-vwap':
      bundle.yearlyVwap.byKey.vwap.applyOptions(options)
      return
    case 'rolling-vwap':
      for (const chartBundle of bundle.rollingVwaps.values()) {
        chartBundle.center.applyOptions(options)
      }
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
