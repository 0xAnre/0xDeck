import {
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
  type IChartApi,
  type IPaneApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { MARKET_STYLE_DEFAULTS, marketStyleColorWithOpacity } from './marketStylePalette.ts'
import {
  computeWilderRsi,
  RSI_MID_LEVEL,
  sanitizeRsiSettings,
  type RsiSettings,
} from './rsi.ts'
import type { MarketCandle } from './types.ts'

/**
 * RSI lives in its own native Lightweight Charts pane below the candles. The
 * pane is created with `chart.addPane()` and removed through `chart.removeSeries`
 * (an empty pane is dropped by the library), so nothing here depends on pane
 * indices — other panes (e.g. Aggregated Liquidations) may come and go.
 */

/** RSI is bounded 0–100 regardless of the loaded values. */
const RSI_PRICE_RANGE: AutoscaleInfo = { priceRange: { minValue: 0, maxValue: 100 } }

/** `autoscaleInfoProvider` runs on every layout pass, so reuse one constant. */
const RSI_AUTOSCALE_INFO_PROVIDER = () => RSI_PRICE_RANGE

/** Share of the chart height given to the RSI pane relative to the candle pane. */
export const RSI_PANE_STRETCH_FACTOR = 0.35

export type RsiLevelPriceLines = {
  overbought: IPriceLine
  mid: IPriceLine
  oversold: IPriceLine
}

export type RsiChartPaneBundle = {
  pane: IPaneApi<Time>
  series: ISeriesApi<'Line'>
  priceLines: RsiLevelPriceLines
  settings: RsiSettings
}

function rsiLineColor(): string {
  const line = MARKET_STYLE_DEFAULTS.primaryLine
  return marketStyleColorWithOpacity(line.color, line.opacityPercent)
}

function rsiLevelColor(): string {
  const level = MARKET_STYLE_DEFAULTS.secondaryLine
  return marketStyleColorWithOpacity(level.color, level.opacityPercent)
}

function createLevelPriceLine(
  series: ISeriesApi<'Line'>,
  price: number,
  color: string,
): IPriceLine {
  return series.createPriceLine({
    price,
    color,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: false,
    title: String(price),
  })
}

function createLevelPriceLines(
  series: ISeriesApi<'Line'>,
  settings: RsiSettings,
): RsiLevelPriceLines {
  const color = rsiLevelColor()
  return {
    overbought: createLevelPriceLine(series, settings.overbought, color),
    mid: createLevelPriceLine(series, RSI_MID_LEVEL, color),
    oversold: createLevelPriceLine(series, settings.oversold, color),
  }
}

function toLineData(points: readonly { time: number; value: number }[]) {
  return points.map((point) => ({
    time: point.time as UTCTimestamp,
    value: point.value,
  }))
}

export function createRsiChartPane(chart: IChartApi, settings: RsiSettings): RsiChartPaneBundle {
  const sanitized = sanitizeRsiSettings(settings)
  const pane = chart.addPane()
  pane.setStretchFactor(RSI_PANE_STRETCH_FACTOR)
  const series = pane.addSeries(LineSeries, {
    color: rsiLineColor(),
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: RSI_AUTOSCALE_INFO_PROVIDER,
  })
  return {
    pane,
    series,
    priceLines: createLevelPriceLines(series, sanitized),
    settings: sanitized,
  }
}

/** Update the overbought/oversold reference lines (the mid line never moves). */
export function applyRsiPaneSettings(
  bundle: RsiChartPaneBundle,
  settings: RsiSettings,
): void {
  const sanitized = sanitizeRsiSettings(settings)
  bundle.settings = sanitized
  bundle.priceLines.overbought.applyOptions({
    price: sanitized.overbought,
    title: String(sanitized.overbought),
  })
  bundle.priceLines.oversold.applyOptions({
    price: sanitized.oversold,
    title: String(sanitized.oversold),
  })
}

export function setRsiPaneHistoryData(
  bundle: RsiChartPaneBundle,
  candles: readonly MarketCandle[],
): void {
  bundle.series.setData(toLineData(computeWilderRsi(candles, bundle.settings.period)))
}

/** Live candles only move the last RSI value; the rest of the line is unchanged. */
export function updateRsiPaneLiveData(
  bundle: RsiChartPaneBundle,
  candles: readonly MarketCandle[],
): void {
  const points = computeWilderRsi(candles, bundle.settings.period)
  const last = points[points.length - 1]
  if (!last) return
  bundle.series.update({ time: last.time as UTCTimestamp, value: last.value })
}

export function clearRsiPaneData(bundle: RsiChartPaneBundle): void {
  bundle.series.setData([])
}

/**
 * Move a newly created RSI pane above a pane that must stay the last one (the
 * Aggregated Liquidations pane with `Position: Bottom`).
 *
 * Only ever moves to a lower index: `chart.addPane()` updates the pane model
 * immediately but creates the pane widgets on the next invalidation frame, and
 * `moveTo` asserts against those widgets, so moving down is the safe direction.
 */
export function moveRsiPaneAbove(bundle: RsiChartPaneBundle, paneIndex: number): void {
  if (bundle.pane.paneIndex() > paneIndex) {
    bundle.pane.moveTo(paneIndex)
  }
}

/**
 * Remove only the RSI series. Removing a pane's last series also removes that
 * pane, while the candle pane and every other overlay stay untouched.
 */
export function removeRsiChartPane(chart: IChartApi, bundle: RsiChartPaneBundle): void {
  chart.removeSeries(bundle.series)
}
