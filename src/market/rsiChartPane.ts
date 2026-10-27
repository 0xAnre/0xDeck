import {
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
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
  type RsiSettings,
} from './rsi.ts'
import { toRsiLineData, toRsiLineDataPoint } from './rsiLineColors.ts'
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

/**
 * Empty space above/below the fixed 0–100 range. The library default
 * (0.1 / 0.1) maps only 80 % of the pane height to the scale, which packs the
 * 70/50/30 reference lines tighter than needed; 0.05 / 0.05 uses 90 % of the
 * pane instead (spacing +12.5 %, ~5 px more per gap at the default pane
 * height) while still leaving the 0/100 axis labels and the last-value label
 * clipped-free at the pane edges.
 */
const RSI_PRICE_SCALE_MARGINS: PriceScaleMargins = { top: 0.05, bottom: 0.05 }

/**
 * Default share of the chart's plot height (all panes together) the RSI pane
 * opens with: ~270–280 px of a ~1100 px plot area, which keeps the fixed 0–100
 * scale labels and the 70/30 reference lines comfortable to read.
 */
export const RSI_PANE_HEIGHT_SHARE = 0.25

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
  // Native price-scale margins only: the fixed 0–100 range, the RSI values and
  // every level price stay exactly as configured — more of the pane height is
  // simply mapped onto that range.
  series.priceScale().applyOptions({ scaleMargins: RSI_PRICE_SCALE_MARGINS })
  // Pane double-click / empty-space handling resolves the RSI pane by series
  // identity, because the pane index changes as other panes come and go.
  registerChartPaneRoleSeries(chart, 'rsi', series)
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

/**
 * Replace the RSI history line, coloring every point from the current
 * overbought/oversold settings. Re-sending the history is what makes a threshold
 * change recolor the already-loaded line without refetching candles.
 */
export function setRsiPaneHistoryData(
  bundle: RsiChartPaneBundle,
  candles: readonly MarketCandle[],
): void {
  bundle.series.setData(
    toRsiLineData(
      computeWilderRsi(candles, bundle.settings.period),
      bundle.settings,
    ),
  )
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
  unregisterChartPaneRoleSeries(chart, 'rsi', bundle.series)
  chart.removeSeries(bundle.series)
}
