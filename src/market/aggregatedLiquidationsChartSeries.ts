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
import { notifyCandlePaneChange } from './candlePane.ts'

type OverlayContext = {
  buckets: readonly AggregatedLiquidationBucket[]
}

class AggregatedLiquidationsRenderer implements IPrimitivePaneRenderer {
  private readonly _models: readonly AggregatedLiquidationBarModel[]

  constructor(models: readonly AggregatedLiquidationBarModel[]) {
    this._models = models
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._models.length === 0) return

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
    if (this._models.length === 0) return null
    return new AggregatedLiquidationsRenderer(this._models)
  }
}

export class AggregatedLiquidationsSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => OverlayContext = () => ({ buckets: [] })
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
    1,
  )

  const context: OverlayContext = { buckets: [] }
  const primitive = new AggregatedLiquidationsSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)

  let currentPosition = position
  let currentBuckets: readonly AggregatedLiquidationBucket[] | null = null

  const applyPosition = (next: AggregatedLiquidationsPosition) => {
    const layout = resolveAggregatedLiquidationsPaneLayout(next, chart.panes().length)
    const pane = series.getPane()
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
    update: () => primitive.requestRedraw(),
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
      chart.removeSeries(series)
      notifyCandlePaneChange(chart)
    },
  }
}
