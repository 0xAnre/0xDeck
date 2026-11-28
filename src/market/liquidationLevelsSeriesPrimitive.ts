/**
 * Lightweight Charts series primitive for the live liquidation-level profile.
 *
 * One primitive is attached to the candle series, so the bars always render in
 * the pane that owns the candles (never in the RSI or Aggregated Liquidations
 * pane) and follow pane reordering, resizing and the shared candle price scale.
 *
 * Paint contract (project standard):
 *  - `updateAllViews()` rebuilds the visible profile from the current chart
 *    state and never requests a repaint; price→row and row→price conversions
 *    are recomputed per paint (nothing is cached across frames);
 *  - geometry is bounded by the pane's visible rows and the positions inside
 *    the visible price band (the price index answers the range query), never by
 *    loaded candle history or the whole open-position book;
 *  - `invalidate()` is called once per external change — a new file, a settings
 *    commit, a visibility change, a status change — and `detached()` clears
 *    every reference so disposal stops scheduling.
 */
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { LiquidationLevelsIndex } from './liquidationLevelsIndex.ts'
import {
  buildLiquidationLevelsProfile,
  liquidationLevelsMaxBarWidthPx,
  LIQUIDATION_LEVELS_ROW_HEIGHT_CSS,
  type LiquidationLevelsProfile,
} from './liquidationLevelsProfileGeometry.ts'
import {
  marketStyleColorWithOpacity,
  MARKET_STYLE_PALETTE,
} from './marketStylePalette.ts'
import type { LiquidationLevelsSettings } from './liquidationLevelsSettings.ts'
import { PRICE_LEVEL_KIND_SHORT_LABEL, type PriceLevelKind } from './priceLevelsKind.ts'

export interface LiquidationLevelsPaneProfile {
  profile: LiquidationLevelsProfile
  /** Candle pane plot width in CSS pixels (pane width minus price scales). */
  plotWidth: number
  topPrice: number
  bottomPrice: number
}

/**
 * Build the current profile from the chart's live price conversions.
 *
 * Called by the pane view on every paint and by the settings/interaction hit
 * test, so both always agree without a shared coordinate cache.
 */
export function resolveLiquidationLevelsPaneProfile(params: {
  chart: IChartApi
  series: ISeriesApi<SeriesType, Time>
  index: LiquidationLevelsIndex
  paneHeightOverride?: number
}): LiquidationLevelsPaneProfile | null {
  const { chart, series, index } = params
  const pane = series.getPane()
  const paneHeight = params.paneHeightOverride ?? pane.getHeight()
  if (!Number.isFinite(paneHeight) || paneHeight <= 0) return null
  const topPrice = series.coordinateToPrice(0)
  const bottomPrice = series.coordinateToPrice(paneHeight)
  if (
    topPrice === null ||
    bottomPrice === null ||
    !Number.isFinite(topPrice) ||
    !Number.isFinite(bottomPrice) ||
    topPrice === bottomPrice
  ) {
    return null
  }
  const plotWidth = resolveLiquidationLevelsPlotWidth(chart, series)
  if (plotWidth === null) return null
  const high = Math.max(topPrice, bottomPrice)
  const low = Math.min(topPrice, bottomPrice)
  const positions = index.iterateRange(low, high)
  const profile = buildLiquidationLevelsProfile({
    positions,
    topPrice: high,
    bottomPrice: low,
    paneHeight,
    rowHeight: LIQUIDATION_LEVELS_ROW_HEIGHT_CSS,
  })
  return {
    profile,
    plotWidth,
    topPrice: high,
    bottomPrice: low,
  }
}

export function resolveLiquidationLevelsPlotWidth(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
): number | null {
  const pane = series.getPane()
  let element: HTMLElement | null
  try {
    element = pane.getHTMLElement()
  } catch {
    element = null
  }
  const totalWidth =
    element && element.clientWidth > 0 ? element.clientWidth : chart.timeScale().width()
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) return null
  // The pane element spans the price scale(s); the plot area is what the
  // primitive paints on and what the bars are anchored to.
  const rightWidth = series.priceScale().width()
  let leftWidth: number
  try {
    leftWidth = chart.priceScale('left').width()
  } catch {
    leftWidth = 0
  }
  const plotWidth = totalWidth - rightWidth - leftWidth
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return null
  return plotWidth
}

export interface LiquidationLevelsPrimitiveContext {
  enabled: boolean
  settings: LiquidationLevelsSettings
  index: LiquidationLevelsIndex
  /** Draw the transient selection halo (single click on the profile). */
  selected: boolean
  /** Short status line drawn at the top of the bar column. */
  label: () => LiquidationLevelsStatusLabel
  /**
   * Which label line to use when several profiles are enabled: 0 is the top
   * line. Fixed per kind, so three enabled profiles stack deterministically
   * instead of overwriting one status line.
   */
  labelRow?: number
}

export interface LiquidationLevelsStatusLabel {
  text: string
  tone: 'live' | 'stale' | 'pending'
}

const BAR_TOP_PADDING_CSS = 14
const LABEL_FONT_CSS = 10
/** Vertical step between stacked profile labels (LIQ / SL / TP). */
const LABEL_LINE_HEIGHT_CSS = 12
/** Alpha of the second side on a row that holds both long and short. */
const MIXED_ROW_SIDE_ALPHA = 0.5

/** Staleness used by a profile label when the connection itself is live. */
export const PRICE_LEVEL_LABEL_STALE_AFTER_MS = 15_000

export function liquidationLevelsStatusLabel(params: {
  phase: string
  resyncing: boolean
  lastAppliedAt: number | null
  nowMs: number
  /** Wall-clock time the profile's channel last received a file. */
  lastFileAt?: number | null
  /**
   * The profile's own book has applied at least one snapshot. A live socket
   * alone is not readiness: the sibling channel's frames do not make this
   * profile ready. Defaults to "a file was applied".
   */
  ready?: boolean
  /** Label prefix, e.g. `SL`; defaults to the liquidation profile's `LEV LIQ`. */
  prefix?: string
}): LiquidationLevelsStatusLabel {
  const { phase, resyncing, lastAppliedAt, nowMs } = params
  const prefix = params.prefix ?? 'LEV LIQ'
  const lastFileAt = params.lastFileAt ?? null
  const ready = params.ready ?? lastAppliedAt !== null
  const label = (text: string) => `${prefix} · ${text}`
  if (
    resyncing ||
    !ready ||
    phase === 'connecting' ||
    phase === 'reconnecting' ||
    phase === 'idle'
  ) {
    return { text: label('SYNCING'), tone: 'pending' }
  }
  if (phase === 'live' || phase === 'stale') {
    const ageSeconds =
      lastAppliedAt === null
        ? null
        : Math.max(0, Math.round((nowMs - lastAppliedAt) / 1000))
    // A live connection can still be quiet on one channel: a profile with no
    // file for longer than the stale window must not claim a fresh book.
    const channelStale =
      phase === 'live' &&
      lastFileAt !== null &&
      nowMs - lastFileAt > PRICE_LEVEL_LABEL_STALE_AFTER_MS
    if (phase === 'stale' || channelStale) {
      return {
        text: ageSeconds === null ? label('STALE') : label(`STALE ${ageSeconds}s`),
        tone: 'stale',
      }
    }
    return {
      text: ageSeconds === null ? label('LIVE') : label(`LIVE ${ageSeconds}s ago`),
      tone: 'live',
    }
  }
  return { text: label('OFFLINE'), tone: 'stale' }
}

/** Status label of one price-level profile, with its own short prefix. */
export function priceLevelStatusLabel(params: {
  kind: PriceLevelKind
  phase: string
  resyncing: boolean
  lastAppliedAt: number | null
  lastFileAt?: number | null
  ready?: boolean
  nowMs: number
}): LiquidationLevelsStatusLabel {
  return liquidationLevelsStatusLabel({
    ...params,
    prefix: PRICE_LEVEL_KIND_SHORT_LABEL[params.kind],
  })
}

interface LiquidationLevelsDrawModel {
  profile: LiquidationLevelsProfile
  plotWidth: number
  settings: LiquidationLevelsSettings
  selected: boolean
  label: LiquidationLevelsStatusLabel
  labelRow: number
}

class LiquidationLevelsRenderer implements IPrimitivePaneRenderer {
  private readonly _model: LiquidationLevelsDrawModel

  constructor(model: LiquidationLevelsDrawModel) {
    this._model = model
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { profile, plotWidth, settings, selected, label, labelRow } = this._model
    if (plotWidth <= 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()

      const plotWidthCss = bitmapSize.width / horizontalPixelRatio
      const maxBarWidthCss = liquidationLevelsMaxBarWidthPx(
        plotWidthCss,
        settings.maxWidthPercent,
      )
      const anchorCss = plotWidthCss
      const anchor = Math.round(anchorCss * horizontalPixelRatio)
      const rowHeightCss = profile.rowHeight
      const rowTopBitmap = (row: number) =>
        Math.floor(row * rowHeightCss * verticalPixelRatio)
      const rowBottomBitmap = (row: number) =>
        Math.ceil((row + 1) * rowHeightCss * verticalPixelRatio)
      const longColor = marketStyleColorWithOpacity(
        settings.longColor,
        settings.longOpacityPercent,
      )
      const shortColor = marketStyleColorWithOpacity(
        settings.shortColor,
        settings.shortOpacityPercent,
      )
      const longSolid = marketStyleColorWithOpacity(settings.longColor, 100)
      const shortSolid = marketStyleColorWithOpacity(settings.shortColor, 100)

      for (const row of profile.rows) {
        // A row always covers its own price extent: floor the top and ceil the
        // bottom, so a row taller than one CSS pixel (the capped tall-pane case)
        // cannot leave its price outside the painted band.
        const top = rowTopBitmap(row.row)
        const rowHeightBitmap = Math.max(1, rowBottomBitmap(row.row) - top)
        const longWidth = Math.round(row.longFraction * maxBarWidthCss * horizontalPixelRatio)
        const shortWidth = Math.round(row.shortFraction * maxBarWidthCss * horizontalPixelRatio)
        // Longest bar first, shorter side on top, so both extents stay readable
        // from the shared right edge. A row can hold both sides when one pixel
        // row spans both clusters; there the second side is painted at half
        // alpha, so the overlap reads as *both* sides instead of hiding the
        // first color (on an equal-width row the result is a 50/50 blend).
        if (longWidth >= shortWidth) {
          if (longWidth > 0) {
            context.fillStyle = longColor
            context.fillRect(anchor - longWidth, top, longWidth, rowHeightBitmap)
          }
          if (shortWidth > 0) {
            context.globalAlpha = longWidth > 0 ? MIXED_ROW_SIDE_ALPHA : 1
            context.fillStyle = shortColor
            context.fillRect(anchor - shortWidth, top, shortWidth, rowHeightBitmap)
            context.globalAlpha = 1
          }
        } else {
          if (shortWidth > 0) {
            context.fillStyle = shortColor
            context.fillRect(anchor - shortWidth, top, shortWidth, rowHeightBitmap)
          }
          if (longWidth > 0) {
            context.globalAlpha = shortWidth > 0 ? MIXED_ROW_SIDE_ALPHA : 1
            context.fillStyle = longColor
            context.fillRect(anchor - longWidth, top, longWidth, rowHeightBitmap)
            context.globalAlpha = 1
          }
        }
        if (selected) {
          const width = Math.max(longWidth, shortWidth)
          if (width > 0) {
            context.strokeStyle = longWidth >= shortWidth ? longSolid : shortSolid
            context.lineWidth = Math.max(1, Math.round(verticalPixelRatio * 0.5))
            context.strokeRect(
              anchor - width,
              top + context.lineWidth / 2,
              width,
              rowHeightBitmap - context.lineWidth,
            )
          }
        }
      }

      // The status/source label is painted even when the visible price window
      // holds no positions: an empty window must still read as a live profile
      // with nothing at this price, never as an indicator that is off.
      {
        const labelColor =
          label.tone === 'live'
            ? marketStyleColorWithOpacity(MARKET_STYLE_PALETTE.light, 90)
            : marketStyleColorWithOpacity(MARKET_STYLE_PALETTE.medium, 90)
        context.fillStyle = labelColor
        context.font = `${LABEL_FONT_CSS * verticalPixelRatio}px system-ui, sans-serif`
        context.textAlign = 'right'
        context.textBaseline = 'top'
        context.fillText(
          label.text,
          Math.round((anchorCss - 4) * horizontalPixelRatio),
          Math.round(
            (BAR_TOP_PADDING_CSS - LABEL_FONT_CSS + labelRow * LABEL_LINE_HEIGHT_CSS) *
              verticalPixelRatio,
          ),
        )
      }

      context.restore()
    })
  }
}

class LiquidationLevelsPaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => LiquidationLevelsPrimitiveContext
  private _model: LiquidationLevelsDrawModel | null = null

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => LiquidationLevelsPrimitiveContext,
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
    this._getContext = getContext
  }

  zOrder(): 'normal' {
    return 'normal'
  }

  update(): void {
    const chart = this._getChart()
    const series = this._getSeries()
    const context = this._getContext()
    if (!chart || !series || !context.enabled) {
      this._model = null
      return
    }
    const resolved = resolveLiquidationLevelsPaneProfile({
      chart,
      series,
      index: context.index,
    })
    if (!resolved) {
      this._model = null
      return
    }
    this._model = {
      profile: resolved.profile,
      plotWidth: resolved.plotWidth,
      settings: context.settings,
      selected: context.selected,
      label: context.label(),
      labelRow: context.labelRow ?? 0,
    }
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this._model === null ? null : new LiquidationLevelsRenderer(this._model)
  }
}

export class LiquidationLevelsSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => LiquidationLevelsPrimitiveContext
  private readonly _view: LiquidationLevelsPaneView

  constructor(getContext: () => LiquidationLevelsPrimitiveContext) {
    this._getContext = getContext
    this._view = new LiquidationLevelsPaneView(
      () => this._chart,
      () => this._series,
      () => this._getContext(),
    )
  }

  setContextProvider(getContext: () => LiquidationLevelsPrimitiveContext): void {
    this._getContext = getContext
    this.invalidate()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }

  updateAllViews(): void {
    this._view.update()
  }

  /** Explicit data/style/visibility/status change: one request per change. */
  invalidate(): void {
    this._requestUpdate?.()
  }

  attached(param: {
    chart: IChartApi
    series: ISeriesApi<SeriesType, Time>
    requestUpdate: () => void
  }): void {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
    this.invalidate()
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }
}

export function attachLiquidationLevelsSeriesPrimitive(
  series: ISeriesApi<'Candlestick', Time>,
  getContext: () => LiquidationLevelsPrimitiveContext,
): {
  primitive: LiquidationLevelsSeriesPrimitive
  dispose: () => void
  update: () => void
} {
  const primitive = new LiquidationLevelsSeriesPrimitive(getContext)
  series.attachPrimitive(primitive)
  return {
    primitive,
    update: () => primitive.invalidate(),
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
