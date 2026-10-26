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
  buildAggregatedLiquidationBarModels,
  type AggregatedLiquidationBarModel,
} from './aggregatedLiquidationsRenderGeometry.ts'

export const AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX = 88

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

class AggregatedLiquidationsSeriesPrimitive implements ISeriesPrimitive<Time> {
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

  updateAllViews(): void {
    this._view.update()
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
 * Create the dedicated liquidation pane (pane index 1) and its two-half bar
 * renderer. Pane 0 always remains the candlestick pane for existing tools.
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

  const pane = chart.panes()[1]
  pane?.setHeight(AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX)

  const context: OverlayContext = { buckets: [] }
  const primitive = new AggregatedLiquidationsSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)

  const onVisibleRangeChange = () => {
    primitive.updateAllViews()
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
  chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)

  const applyPosition = (next: AggregatedLiquidationsPosition) => {
    series.priceScale().applyOptions({
      invertScale: next === 'top',
      scaleMargins: { top: 0.08, bottom: 0 },
    })
  }
  applyPosition(position)

  return {
    setBuckets: (buckets) => {
      context.buckets = buckets
      series.setData(
        buckets.map((bucket) => ({
          time: bucket.time as UTCTimestamp,
          value: Math.max(bucket.long, bucket.short),
        })),
      )
      primitive.updateAllViews()
    },
    setPosition: (next) => {
      applyPosition(next)
      primitive.updateAllViews()
    },
    update: () => primitive.updateAllViews(),
    dispose: () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      series.detachPrimitive(primitive)
      primitive.detached()
      chart.removeSeries(series)
    },
  }
}
