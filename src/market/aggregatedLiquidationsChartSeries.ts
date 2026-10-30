import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import {
  HistogramSeries,
  type IChartApi,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { LIQUIDATION_LONG_COLOR, LIQUIDATION_SHORT_COLOR } from './aggregatedLiquidationsColors.ts'
import {
  MARKET_STYLE_PALETTE,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'
import type { AggregatedLiquidationBucket } from './aggregatedLiquidations.ts'
import type { AggregatedLiquidationsPosition } from './aggregatedLiquidationsSettings.ts'
import {
  AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX,
  resolveAggregatedLiquidationsPaneLayout,
} from './aggregatedLiquidationsPaneLayout.ts'
import {
  buildAggregatedLiquidationBarModels,
  type AggregatedLiquidationBarModel,
} from './aggregatedLiquidationsRenderGeometry.ts'
import { notifyCandlePaneChange, paneHoldsCandleSeries } from './candlePane.ts'
import {
  registerChartPaneRoleSeries,
  unregisterChartPaneRoleSeries,
} from './chartPaneRoles.ts'

type OverlayContext = {
  buckets: readonly AggregatedLiquidationBucket[]
  /** Transient overlay-indicator selection (gap G3); never persisted. */
  selected: boolean
}

/** Pane-scoped selection rim for the Aggregated Liquidations overlay. */
export const AGGREGATED_LIQUIDATIONS_SELECTION_RIM_COLOR = marketStyleColorWithOpacity(
  MARKET_STYLE_PALETTE.medium,
  70,
)
export const AGGREGATED_LIQUIDATIONS_SELECTION_RIM_WIDTH_PX = 1

class AggregatedLiquidationsRenderer implements IPrimitivePaneRenderer {
  private readonly _models: readonly AggregatedLiquidationBarModel[]
  private readonly _selected: boolean

  constructor(models: readonly AggregatedLiquidationBarModel[], selected: boolean) {
    this._models = models
    this._selected = selected
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()

      for (const model of this._models) {
        for (const [bar, color] of [
          [model.long, LIQUIDATION_LONG_COLOR],
          [model.short, LIQUIDATION_SHORT_COLOR],
        ] as const) {
          if (!bar) continue
          const x = Math.round(bar.x * horizontalPixelRatio)
          const y = Math.round(bar.top * verticalPixelRatio)
          const width = Math.max(0, Math.round(bar.width * horizontalPixelRatio))
          const height = Math.max(0, Math.round((bar.bottom - bar.top) * verticalPixelRatio))
          if (width === 0 || height === 0) continue
          context.fillStyle = color
          context.fillRect(x, y, width, height)
        }
      }

      if (this._selected) {
        // The pane itself is the object, so its selection feedback is a rim
        // instead of a line halo (the bars have no line path).
        const inset = AGGREGATED_LIQUIDATIONS_SELECTION_RIM_WIDTH_PX
        context.strokeStyle = AGGREGATED_LIQUIDATIONS_SELECTION_RIM_COLOR
        context.lineWidth = inset * horizontalPixelRatio
        context.strokeRect(
          inset * horizontalPixelRatio,
          inset * verticalPixelRatio,
          bitmapSize.width - 2 * inset * horizontalPixelRatio,
          bitmapSize.height - 2 * inset * verticalPixelRatio,
        )
      }

      context.restore()
    })
  }
}

class AggregatedLiquidationsPaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => OverlayContext
  private _models: AggregatedLiquidationBarModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => OverlayContext,
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
    if (!chart || !series) {
      this._models = []
      return
    }

    const timeScale = chart.timeScale()
    this._models = buildAggregatedLiquidationBarModels({
      buckets: this._getContext().buckets,
      barSpacing: timeScale.options().barSpacing,
      timeToCoordinate: (time) => timeScale.timeToCoordinate(time as UTCTimestamp),
      valueToCoordinate: (value) => series.priceToCoordinate(value),
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    const selected = this._getContext().selected
    if (this._models.length === 0 && !selected) return null
    return new AggregatedLiquidationsRenderer(this._models, selected)
  }
}

export class AggregatedLiquidationsSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => OverlayContext = () => ({ buckets: [], selected: false })
  private readonly _view: AggregatedLiquidationsPaneView

  constructor(getContext: () => OverlayContext) {
    this._getContext = getContext
    this._view = new AggregatedLiquidationsPaneView(
      () => this._chart,
      () => this._series,
      () => this._getContext(),
    )
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }

  /**
   * Called by the chart when the viewport changes. Rebuild the view models
   * only; the chart is already redrawing, so requesting another update here
   * would loop forever.
   */
  updateAllViews(): void {
    this._view.update()
  }

  /** Rebuild the view models after an external change and request one redraw. */
  requestRedraw(): void {
    if (!this._chart || !this._series) return
    this.updateAllViews()
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
    this.updateAllViews()
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }
}

export type AggregatedLiquidationsChartOverlay = {
  setBuckets: (buckets: readonly AggregatedLiquidationBucket[]) => void
  setPosition: (position: AggregatedLiquidationsPosition) => void
  /** Transient overlay-indicator selection feedback (never persisted). */
  setSelected: (selected: boolean) => void
  /** Pane index the liquidation series currently occupies. */
  getPaneIndex: () => number
  /** Position the overlay is currently laid out for. */
  getPosition: () => AggregatedLiquidationsPosition
  update: () => void
  dispose: () => void
}

/**
 * Create the dedicated liquidation pane and its two-half bar renderer. The
 * pane is moved below (Bottom, last pane) or above (Top, pane 0) the candles
 * without recreating the chart or either series.
 */
export function createAggregatedLiquidationsChartOverlay(
  chart: IChartApi,
  position: AggregatedLiquidationsPosition,
): AggregatedLiquidationsChartOverlay {
  const series = chart.addSeries(
    HistogramSeries,
    {
      // The native series only establishes the pane's independent USD price
      // scale. The primitive paints the visible red/green half-bars.
      color: 'rgba(0, 0, 0, 0)',
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'volume' },
    },
    // Always append a brand new pane. Hardcoding an index can land the series
    // inside an existing pane (the candle pane while `Position: Top` is active),
    // after which moving/resizing that pane would squeeze and hide the candles.
    chart.panes().length,
  )

  const context: OverlayContext = { buckets: [], selected: false }
  const primitive = new AggregatedLiquidationsSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)
  // Pane double-click / empty-space handling resolves this pane by series
  // identity: `Position: Top/Bottom` moves the pane index around the candles.
  registerChartPaneRoleSeries(chart, 'aggregated-liquidations', series)

  let currentPosition = position
  let currentBuckets: readonly AggregatedLiquidationBucket[] | null = null

  /**
   * Data the hidden histogram series carries: one point per bucket, the larger
   * of the two sides, which is what the primitive's bar geometry scales to.
   */
  const liquidationSeriesData = (buckets: readonly AggregatedLiquidationBucket[]) =>
    buckets.map((bucket) => ({
      time: bucket.time as UTCTimestamp,
      value: Math.max(bucket.long, bucket.short),
    }))

  const applyPosition = (next: AggregatedLiquidationsPosition) => {
    const pane = series.getPane()
    // The candle pane owns the candles and must never be reordered or resized
    // by this overlay; only a pane that holds the liquidation series alone is
    // safe to move and shrink.
    if (paneHoldsCandleSeries(chart, pane)) return

    const layout = resolveAggregatedLiquidationsPaneLayout(next, chart.panes().length)
    if (pane.paneIndex() !== layout.targetPaneIndex) {
      pane.moveTo(layout.targetPaneIndex)
      notifyCandlePaneChange(chart)
    }
    series.priceScale().applyOptions({
      invertScale: layout.invertScale,
      scaleMargins: layout.scaleMargins,
    })
    series.getPane().setHeight(AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX)
  }
  applyPosition(position)

  // The default `'right'` price-scale id is chart-global in Lightweight Charts 5:
  // `PriceScaleApi.applyOptions` merges the options into the chart-wide
  // `rightPriceScale` template, which is what every pane created afterwards
  // inherits. Restoring a manual candle price scale therefore leaves the template
  // at `autoScale: false`, and this pane — created after that restore on a page
  // refresh — would be born manual. A non-autoscale pane is never re-scaled again
  // (`Pane._internal_recalculatePriceScale` returns early), so it would stay on
  // the `[-0.5, 0.5]` placeholder its creation pass installed: bars projected far
  // off-pane and a `0` / `0.5` axis until the price axis is double-clicked, which
  // repairs the pane instance only. Re-assert autoscale once here, at creation,
  // which also repairs the chart-wide template for panes created later.
  // Deliberately **not** inside `applyPosition`: that runs on Top/Bottom changes
  // and must preserve a manual liquidation zoom the user applied on purpose. The
  // candle pane is skipped for the same reason `applyPosition` skips it.
  if (!paneHoldsCandleSeries(chart, series.getPane())) {
    series.priceScale().applyOptions({ autoScale: true })
  }

  return {
    setBuckets: (buckets) => {
      if (buckets === currentBuckets) return
      currentBuckets = buckets
      context.buckets = buckets
      const data = liquidationSeriesData(buckets)
      series.setData(data)

      // A pane whose price scale never received a visible-bar window has no
      // price range at all: the axis draws no marks and `priceToCoordinate()`
      // returns `0` for every value, so the primitive renders nothing — an
      // enabled indicator whose pane *and* scale both look empty until the
      // price axis is double-clicked, which performs exactly this
      // recalculation (`_internal_resetPriceScale`). Re-attaching the same data
      // is the only public API that makes the library recalculate this pane's
      // autoscale: `setData` runs `recalculatePane`, which stores the visible
      // bar window the lazy range computation needs. It is idempotent, changes
      // no visible range, and is skipped whenever the scale already has a
      // range, so the healthy path pays one cheap read. Autoscale stays the
      // only scaling mode used.
      if (series.priceScale().getVisibleRange() === null) {
        series.setData(data)
      }

      primitive.requestRedraw()
    },
    setPosition: (next) => {
      if (next === currentPosition) return
      currentPosition = next
      applyPosition(next)
      primitive.requestRedraw()
    },
    setSelected: (selected) => {
      if (context.selected === selected) return
      context.selected = selected
      primitive.requestRedraw()
    },
    getPaneIndex: () => series.getPane().paneIndex(),
    getPosition: () => currentPosition,
    update: () => primitive.requestRedraw(),
    dispose: () => {
      unregisterChartPaneRoleSeries(chart, 'aggregated-liquidations', series)
      series.detachPrimitive(primitive)
      primitive.detached()
      chart.removeSeries(series)
      notifyCandlePaneChange(chart)
    },
  }
}
