import {
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
  type IChartApi,
  type IPaneApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { registerChartPaneRoleSeries, unregisterChartPaneRoleSeries } from './chartPaneRoles.ts'
import { MARKET_STYLE_DEFAULTS, marketStyleColorWithOpacity } from './marketStylePalette.ts'
import {
  bucketOrderBookDepthSamples,
  filterOrderBookDepthPointsToCandles,
  type OrderBookDepthSample,
  type OrderBookDepthThresholds,
} from './orderBookDepth.ts'
import {
  sanitizeOrderBookDepthSettings,
  type OrderBookDepthSettings,
} from './orderBookDepthSettings.ts'
import { toOrderBookDepthLineData } from './orderBookDepthThresholdColors.ts'
import type { CandleInterval } from './types.ts'

/**
 * Order Book Depth lives in its own native Lightweight Charts pane. The pane is
 * created with `chart.addPane()` and removed through `chart.removeSeries` (an
 * empty pane is dropped by the library), so nothing here depends on pane
 * indices — RSI and Aggregated Liquidations panes may come and go.
 */

/** Imbalance is bounded −100…+100 regardless of the loaded samples. */
const ORDER_BOOK_DEPTH_PRICE_RANGE: AutoscaleInfo = {
  priceRange: { minValue: -100, maxValue: 100 },
}

const ORDER_BOOK_DEPTH_AUTOSCALE_INFO_PROVIDER = () =>
  ORDER_BOOK_DEPTH_PRICE_RANGE

/** Share of the chart height given to the order-book pane vs. the candle pane. */
export const ORDER_BOOK_DEPTH_PANE_STRETCH_FACTOR = 0.35

export type OrderBookDepthLevelPriceLines = {
  positive: IPriceLine
  mid: IPriceLine
  negative: IPriceLine
}

export type OrderBookDepthChartPaneBundle = {
  pane: IPaneApi<Time>
  series: ISeriesApi<'Line'>
  priceLines: OrderBookDepthLevelPriceLines
  settings: OrderBookDepthSettings
}

function lineColor(): string {
  const line = MARKET_STYLE_DEFAULTS.primaryLine
  return marketStyleColorWithOpacity(line.color, line.opacityPercent)
}

function levelColor(): string {
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
  settings: OrderBookDepthSettings,
): OrderBookDepthLevelPriceLines {
  const color = levelColor()
  return {
    positive: createLevelPriceLine(
      series,
      settings.positiveThreshold,
      color,
    ),
    mid: createLevelPriceLine(series, 0, color),
    negative: createLevelPriceLine(
      series,
      settings.negativeThreshold,
      color,
    ),
  }
}

export function orderBookDepthThresholds(
  settings: OrderBookDepthSettings,
): OrderBookDepthThresholds {
  return {
    positive: settings.positiveThreshold,
    negative: settings.negativeThreshold,
  }
}

export function createOrderBookDepthChartPane(
  chart: IChartApi,
  settings: OrderBookDepthSettings,
): OrderBookDepthChartPaneBundle {
  const sanitized = sanitizeOrderBookDepthSettings(settings)
  const pane = chart.addPane()
  pane.setStretchFactor(ORDER_BOOK_DEPTH_PANE_STRETCH_FACTOR)
  const series = pane.addSeries(LineSeries, {
    color: lineColor(),
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: ORDER_BOOK_DEPTH_AUTOSCALE_INFO_PROVIDER,
  })
  // Pane double-click / empty-space handling resolves this pane by series
  // identity, because the pane index changes as other panes come and go.
  registerChartPaneRoleSeries(chart, 'order-book-depth', series)
  return {
    pane,
    series,
    priceLines: createLevelPriceLines(series, sanitized),
    settings: sanitized,
  }
}

/** Update the positive/zero/negative reference lines and thresholds. */
export function applyOrderBookDepthPaneSettings(
  bundle: OrderBookDepthChartPaneBundle,
  settings: OrderBookDepthSettings,
): void {
  const sanitized = sanitizeOrderBookDepthSettings(settings)
  bundle.settings = sanitized
  bundle.priceLines.positive.applyOptions({
    price: sanitized.positiveThreshold,
    title: String(sanitized.positiveThreshold),
  })
  bundle.priceLines.mid.applyOptions({ price: 0, title: '0' })
  bundle.priceLines.negative.applyOptions({
    price: sanitized.negativeThreshold,
    title: String(sanitized.negativeThreshold),
  })
}

/**
 * Replace the pane history, coloring every point from the current thresholds.
 * Re-sending history is what makes a threshold change recolor the already-loaded
 * line without refetching candles.
 */
export function setOrderBookDepthPaneHistoryData(
  bundle: OrderBookDepthChartPaneBundle,
  samples: readonly OrderBookDepthSample[],
  interval: CandleInterval,
  candleTimes: readonly number[],
): void {
  const points = filterOrderBookDepthPointsToCandles(
    bucketOrderBookDepthSamples(samples, interval),
    candleTimes,
  )
  bundle.series.setData(
    toOrderBookDepthLineData(points, orderBookDepthThresholds(bundle.settings)),
  )
}

export function clearOrderBookDepthPaneData(
  bundle: OrderBookDepthChartPaneBundle,
): void {
  bundle.series.setData([])
}

/**
 * Move a newly created order-book pane below the RSI pane (when present) and
 * above the bottom-positioned Aggregated Liquidations pane.
 *
 * Only ever moves to a lower index: `chart.addPane()` updates the pane model
 * immediately but creates the pane widgets on the next invalidation frame, and
 * `moveTo` asserts against those widgets, so moving down is the safe direction.
 */
export function moveOrderBookDepthPaneTo(
  bundle: OrderBookDepthChartPaneBundle,
  paneIndex: number,
): void {
  if (bundle.pane.paneIndex() > paneIndex) {
    bundle.pane.moveTo(paneIndex)
  }
}

/**
 * Remove only the order-book series. Removing a pane's last series also removes
 * that pane, while the candle pane and every other overlay stay untouched.
 */
export function removeOrderBookDepthChartPane(
  chart: IChartApi,
  bundle: OrderBookDepthChartPaneBundle,
): void {
  unregisterChartPaneRoleSeries(chart, 'order-book-depth', bundle.series)
  chart.removeSeries(bundle.series)
}
