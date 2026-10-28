import {
  BaselineSeries,
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
  type BaselineData,
  type IChartApi,
  type IPaneApi,
  type IPriceLine,
  type ISeriesApi,
  type PriceScaleMargins,
  type Time,
} from 'lightweight-charts'
import { MARKET_STYLE_DEFAULTS, marketStyleColorWithOpacity } from './marketStylePalette.ts'
import { registerChartPaneRoleSeries, unregisterChartPaneRoleSeries } from './chartPaneRoles.ts'
import {
  computeWilderRsi,
  RSI_MID_LEVEL,
  sanitizeRsiSettings,
  type RsiPoint,
  type RsiSettings,
} from './rsi.ts'
import {
  RSI_OVERBOUGHT_LINE_COLOR,
  RSI_OVERSOLD_LINE_COLOR,
  toRsiLineData,
  toRsiLineDataPoint,
} from './rsiLineColors.ts'
import type { MarketCandle } from './types.ts'

/**
 * Fixed, quiet opacity for the threshold fill: a ~13 % wash behind the RSI
 * line while it is outside a threshold. The colors are the semantic threshold
 * colors, identical in every theme; the effect is intentionally not
 * user-configurable in this task.
 */
export const RSI_THRESHOLD_FILL_OPACITY_PERCENT = 13

/**
 * RSI lives in its own native Lightweight Charts pane below the candles. The
 * pane is created with `chart.addPane()` and removed through `chart.removeSeries`
 * (an empty pane is dropped by the library), so nothing here depends on pane
 * indices — other panes (e.g. Aggregated Liquidations) may come and go.
 */

/**
 * Visible RSI range: a modest zoom into the middle of the 0–100 scale. The
 * values, thresholds and level price lines keep their true prices (70/50/30);
 * the range only decides how much pane height each unit gets. RSI readings
 * outside 5–95 are outside the visible area by design — no clamping or padding.
 */
const RSI_PRICE_RANGE: AutoscaleInfo = { priceRange: { minValue: 5, maxValue: 95 } }

/** `autoscaleInfoProvider` runs on every layout pass, so reuse one constant. */
const RSI_AUTOSCALE_INFO_PROVIDER = () => RSI_PRICE_RANGE

/**
 * Empty space above/below the visible range. The library default (0.1 / 0.1)
 * would map only 80 % of the pane height to the scale and pack the 70/50/30
 * reference lines together; 0.02 / 0.02 maps 96 % of the pane onto the 5–95
 * range. At the 22 % default share (~233 px pane at a 1061 px plot) that is
 * ~49.8 px per 20-unit gap — more than the previous ~47.7 px — while the small
 * non-zero margin keeps the last-value label and the scale edges clear of the
 * pane boundary (a 0 / 0 margin would risk clipping them).
 */
const RSI_PRICE_SCALE_MARGINS: PriceScaleMargins = { top: 0.02, bottom: 0.02 }

/**
 * Default share of the chart's plot height (all panes together) the RSI pane
 * opens with: ~233 px of a ~1061 px plot area. The default is relative, so it
 * stays responsive to chart size; the vertical spacing between the 70/50/30
 * lines comes from the visible range, not from this share.
 */
export const RSI_PANE_HEIGHT_SHARE = 0.22

/** Keeps a remembered (dragged) share inside a sane, non-degenerate range. */
const MIN_PANE_HEIGHT_SHARE = 0.05
const MAX_PANE_HEIGHT_SHARE = 0.8

/**
 * Candle-pane stretch factor seeded by `createChart({ addDefaultPane })`:
 * Lightweight Charts assigns the main pane `DEFAULT_STRETCH_FACTOR * 2`.
 */
const CANDLE_PANE_BASELINE_STRETCH_FACTOR = 2

function sanitizePaneHeightShare(share: number): number {
  if (!Number.isFinite(share)) return RSI_PANE_HEIGHT_SHARE
  return Math.min(MAX_PANE_HEIGHT_SHARE, Math.max(MIN_PANE_HEIGHT_SHARE, share))
}

/** Sum of the stretch factors of every pane currently on the chart. */
export function sumPaneStretchFactors(chart: IChartApi): number {
  return chart
    .panes()
    .reduce((total, pane) => total + pane.getStretchFactor(), 0)
}

/**
 * Stretch factor that gives the RSI pane `share` of the plot height.
 *
 * Lightweight Charts sizes panes by stretch factor
 * (`paneHeight = stretchFactor / totalStretch * plotHeight`) and seeds the
 * candle pane with 2, so a bare constant has no stable meaning: the previous
 * `0.35` produced only `0.35 / (2 + 0.35) ≈ 14.9 %` instead of the ~26 % it
 * looked like. Deriving the factor from the live stretch total of the *other*
 * panes makes the requested share exact for any candle baseline — including a
 * manually dragged one — and stays responsive to the chart size, because the
 * share is relative.
 */
export function computeRsiPaneStretchFactor(
  otherPaneStretchTotal: number,
  share: number = RSI_PANE_HEIGHT_SHARE,
): number {
  const safeShare = sanitizePaneHeightShare(share)
  const otherTotal =
    Number.isFinite(otherPaneStretchTotal) && otherPaneStretchTotal > 0
      ? otherPaneStretchTotal
      : CANDLE_PANE_BASELINE_STRETCH_FACTOR
  return (otherTotal * safeShare) / (1 - safeShare)
}

/**
 * Share of the plot height the pane occupies right now, used to remember a user
 * drag across an RSI remove/re-add cycle. `null` when the chart cannot report a
 * usable total (e.g. a single-pane chart before layout).
 */
export function rsiPaneHeightShare(
  chart: IChartApi,
  pane: IPaneApi<Time>,
): number | null {
  const total = sumPaneStretchFactors(chart)
  if (!(total > 0)) return null
  return pane.getStretchFactor() / total
}

export type RsiLevelPriceLines = {
  overbought: IPriceLine
  mid: IPriceLine
  oversold: IPriceLine
}

export type RsiChartPaneBundle = {
  pane: IPaneApi<Time>
  series: ISeriesApi<'Line'>
  overboughtFillSeries: ISeriesApi<'Baseline'>
  oversoldFillSeries: ISeriesApi<'Baseline'>
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

/** Semantic threshold color folded with the fixed fill opacity. */
function rsiThresholdFillColor(
  color: string,
  opacityPercent: number = RSI_THRESHOLD_FILL_OPACITY_PERCENT,
): string {
  return marketStyleColorWithOpacity(color, opacityPercent)
}

function toRsiFillDataPoint(point: RsiPoint): BaselineData<Time> {
  return { time: point.time as Time, value: point.value }
}

type RsiThresholdFillSeriesOptions = {
  baseValue: number
  topFillColor1: string
  topFillColor2: string
  bottomFillColor1: string
  bottomFillColor2: string
  lineColor: string
}

/**
 * Native BaselineSeries that paints one threshold band. The fill only spans
 * between the RSI line and `baseValue`, so the inside-threshold side is empty
 * by construction and the threshold-side gradient stop controls the fade.
 */
function createRsiThresholdFillSeries(
  pane: IPaneApi<Time>,
  options: RsiThresholdFillSeriesOptions,
): ISeriesApi<'Baseline'> {
  return pane.addSeries(BaselineSeries, {
    baseValue: { type: 'price', price: options.baseValue },
    relativeGradient: false,
    topFillColor1: options.topFillColor1,
    topFillColor2: options.topFillColor2,
    bottomFillColor1: options.bottomFillColor1,
    bottomFillColor2: options.bottomFillColor2,
    topLineColor: options.lineColor,
    bottomLineColor: options.lineColor,
    lineVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
    pointMarkersVisible: false,
    autoscaleInfoProvider: RSI_AUTOSCALE_INFO_PROVIDER,
  })
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

/**
 * Create the RSI pane.
 *
 * `rememberedShare` is the fraction of the plot height the pane should occupy.
 * It is `null` for a fresh pane (the default share) and carries the share a user
 * last had — after a manual pane drag — when the indicator is toggled off and on
 * again. Sizing is applied exactly once here: later re-renders, settings changes,
 * resizes and indicator toggles must never overwrite a user's manual pane drag.
 */
export function createRsiChartPane(
  chart: IChartApi,
  settings: RsiSettings,
  rememberedShare: number | null = null,
): RsiChartPaneBundle {
  const sanitized = sanitizeRsiSettings(settings)
  // Measure the other panes before adding this one: `chart.addPane()` appends a
  // pane with the library default factor, which must not count as "other".
  const otherPanesStretch = sumPaneStretchFactors(chart)
  const pane = chart.addPane()
  pane.setStretchFactor(
    computeRsiPaneStretchFactor(
      otherPanesStretch,
      rememberedShare ?? RSI_PANE_HEIGHT_SHARE,
    ),
  )
  const series = pane.addSeries(LineSeries, {
    color: rsiLineColor(),
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: RSI_AUTOSCALE_INFO_PROVIDER,
  })
  // Native price-scale margins only: the 5–95 visible range, the RSI values and
  // every level price stay exactly as configured — more of the pane height is
  // simply mapped onto that range.
  series.priceScale().applyOptions({ scaleMargins: RSI_PRICE_SCALE_MARGINS })
  // Pane double-click / empty-space handling resolves the RSI pane by series
  // identity, because the pane index changes as other panes come and go.
  registerChartPaneRoleSeries(chart, 'rsi', series)
  const overboughtFillSeries = createRsiThresholdFillSeries(pane, {
    baseValue: sanitized.overbought,
    topFillColor1: rsiThresholdFillColor(RSI_OVERBOUGHT_LINE_COLOR),
    topFillColor2: rsiThresholdFillColor(RSI_OVERBOUGHT_LINE_COLOR, 0),
    bottomFillColor1: rsiThresholdFillColor(RSI_OVERBOUGHT_LINE_COLOR, 0),
    bottomFillColor2: rsiThresholdFillColor(RSI_OVERBOUGHT_LINE_COLOR, 0),
    lineColor: rsiThresholdFillColor(RSI_OVERBOUGHT_LINE_COLOR, 0),
  })
  const oversoldFillSeries = createRsiThresholdFillSeries(pane, {
    baseValue: sanitized.oversold,
    topFillColor1: rsiThresholdFillColor(RSI_OVERSOLD_LINE_COLOR, 0),
    topFillColor2: rsiThresholdFillColor(RSI_OVERSOLD_LINE_COLOR, 0),
    bottomFillColor1: rsiThresholdFillColor(RSI_OVERSOLD_LINE_COLOR, 0),
    bottomFillColor2: rsiThresholdFillColor(RSI_OVERSOLD_LINE_COLOR),
    lineColor: rsiThresholdFillColor(RSI_OVERSOLD_LINE_COLOR, 0),
  })
  return {
    pane,
    series,
    overboughtFillSeries,
    oversoldFillSeries,
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
  // Move each native baseline immediately; no candle refetch and no history
  // re-send are needed for the new thresholds to take effect.
  bundle.overboughtFillSeries.applyOptions({
    baseValue: { type: 'price', price: sanitized.overbought },
  })
  bundle.oversoldFillSeries.applyOptions({
    baseValue: { type: 'price', price: sanitized.oversold },
  })
}

/**
 * Replace the RSI history line, coloring every point from the current
 * overbought/oversold settings. Re-sending the history is what makes a threshold
 * change recolor the already-loaded line without refetching candles.
 */
export function setRsiPaneHistoryData(
  bundle: RsiChartPaneBundle,
  candles: readonly MarketCandle[],
): void {
  const points = computeWilderRsi(candles, bundle.settings.period)
  bundle.series.setData(toRsiLineData(points, bundle.settings))
  const fillData = points.map(toRsiFillDataPoint)
  bundle.overboughtFillSeries.setData(fillData)
  bundle.oversoldFillSeries.setData(fillData)
}

/** Live candles only move the last RSI value; the rest of the line is unchanged. */
export function updateRsiPaneLiveData(
  bundle: RsiChartPaneBundle,
  candles: readonly MarketCandle[],
): void {
  const points = computeWilderRsi(candles, bundle.settings.period)
  const last = points[points.length - 1]
  if (!last) return
  bundle.series.update(toRsiLineDataPoint(last, bundle.settings))
  const fillPoint = toRsiFillDataPoint(last)
  bundle.overboughtFillSeries.update(fillPoint)
  bundle.oversoldFillSeries.update(fillPoint)
}

export function clearRsiPaneData(bundle: RsiChartPaneBundle): void {
  bundle.series.setData([])
  bundle.overboughtFillSeries.setData([])
  bundle.oversoldFillSeries.setData([])
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
  chart.removeSeries(bundle.overboughtFillSeries)
  chart.removeSeries(bundle.oversoldFillSeries)
  unregisterChartPaneRoleSeries(chart, 'rsi', bundle.series)
  chart.removeSeries(bundle.series)
}
