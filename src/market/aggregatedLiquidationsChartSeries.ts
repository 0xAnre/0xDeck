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
  aggregatedLiquidationsPeakNotionalInRange,
  manualAggregatedLiquidationsRangeHidesBars,
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

  /** Visible time range in unix seconds, or `null` when the time scale is empty. */
  const visibleTimeRange = (): { from: number; to: number } | null => {
    const range = chart.timeScale().getVisibleRange()
    if (range === null) return null
    const { from, to } = range
    if (typeof from !== 'number' || typeof to !== 'number') return null
    return { from, to }
  }

  /**
   * Restore native autoscale when the pane's manual price range cannot show a
   * single bar that is actually on screen.
   *
   * Native autoscale stays the normal path — autoscale panes return here before
   * reading anything — and Lightweight Charts keeps a manual price range until
   * the axis is double-clicked, which leaves an enabled indicator looking
   * absent with no way to notice why. Only a range that hides every *visible*
   * bar is replaced; a range that still shows bars is left exactly as the user
   * scaled it. The peak is taken from the buckets inside the visible time
   * window, because that is what both the primitive and the library's own
   * autoscale consider: a large bucket far off screen must not keep a manual
   * range alive that hides everything currently drawn.
   */
  const restoreAutoscaleWhenManualRangeHidesVisibleBars = () => {
    const priceScale = series.priceScale()
    if (priceScale.options().autoScale) return
    // Never reset the candle pane's scale, even if a pane collision ever put
    // this series inside it (`applyPosition` guards the same hazard).
    if (paneHoldsCandleSeries(chart, series.getPane())) return

    const visiblePeak = aggregatedLiquidationsPeakNotionalInRange(
      currentBuckets ?? [],
      visibleTimeRange(),
    )
    if (
      !manualAggregatedLiquidationsRangeHidesBars(
        priceScale.getVisibleRange(),
        visiblePeak,
      )
    ) {
      return
    }
    priceScale.setAutoScale(true)
  }

  // Panning and zooming change which bars are on screen without touching the
  // bucket data, so the same check has to run on every visible-range change.
  const onVisibleTimeRangeChange = () => {
    restoreAutoscaleWhenManualRangeHidesVisibleBars()
  }
  chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleTimeRangeChange)


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

  return {
    setBuckets: (buckets) => {
      if (buckets === currentBuckets) return
      currentBuckets = buckets
      context.buckets = buckets
      restoreAutoscaleWhenManualRangeHidesVisibleBars()
      series.setData(
        buckets.map((bucket) => ({
          time: bucket.time as UTCTimestamp,
          value: Math.max(bucket.long, bucket.short),
        })),
      )
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
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleTimeRangeChange)
      unregisterChartPaneRoleSeries(chart, 'aggregated-liquidations', series)
      series.detachPrimitive(primitive)
      primitive.detached()
      chart.removeSeries(series)
      notifyCandlePaneChange(chart)
    },
  }
}
