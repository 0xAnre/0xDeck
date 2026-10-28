import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesType,
  Time,
} from 'lightweight-charts'
import {
  buildRsiThresholdFillDrawModels,
  type RsiThresholdFillDrawModel,
  type RsiThresholdFillPoint,
  type RsiThresholdFillThresholds,
} from './rsiThresholdFillRenderGeometry.ts'

export type RsiThresholdFillSeriesPrimitiveContext = {
  points: readonly RsiThresholdFillPoint[]
  thresholds: RsiThresholdFillThresholds
  /** Resolved canvas fill styles for the overbought / oversold washes. */
  overboughtFillStyle: string
  oversoldFillStyle: string
  visible: boolean
}

class RsiThresholdFillRenderer implements IPrimitivePaneRenderer {
  private readonly _models: RsiThresholdFillDrawModel[]

  constructor(models: RsiThresholdFillDrawModel[]) {
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
        const vertices = model.polygon
        if (vertices.length < 6) continue
        context.beginPath()
        for (let index = 0; index < vertices.length; index += 2) {
          const x = Math.round(vertices[index] * horizontalPixelRatio)
          const y = Math.round(vertices[index + 1] * verticalPixelRatio)
          if (index === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.closePath()
        context.fillStyle = model.fillStyle
        context.fill()
      }

      context.restore()
    })
  }
}

class RsiThresholdFillPaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => RsiThresholdFillSeriesPrimitiveContext
  private _models: RsiThresholdFillDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => RsiThresholdFillSeriesPrimitiveContext,
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
    this._getContext = getContext
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  update(): void {
    const chart = this._getChart()
    const series = this._getSeries()
    const context = this._getContext()
    if (!chart || !series || !context.visible || context.points.length === 0) {
      this._models = []
      return
    }

    const timeScale = chart.timeScale()
    this._models = buildRsiThresholdFillDrawModels({
      points: context.points,
      thresholds: context.thresholds,
      overboughtFillStyle: context.overboughtFillStyle,
      oversoldFillStyle: context.oversoldFillStyle,
      barSpacing: timeScale.options().barSpacing,
      timeToCoordinate: (time) => timeScale.timeToCoordinate(time),
      priceToY: (price) => series.priceToCoordinate(price),
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new RsiThresholdFillRenderer(this._models)
  }
}

export class RsiThresholdFillSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => RsiThresholdFillSeriesPrimitiveContext = () => ({
    points: [],
    thresholds: { overbought: 0, oversold: 0 },
    overboughtFillStyle: 'transparent',
    oversoldFillStyle: 'transparent',
    visible: false,
  })
  private readonly _view: RsiThresholdFillPaneView

  constructor(getContext: () => RsiThresholdFillSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new RsiThresholdFillPaneView(
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

export type RsiThresholdFillSeriesAttachment = {
  setData: (
    points: readonly RsiThresholdFillPoint[],
    thresholds: RsiThresholdFillThresholds,
  ) => void
  setThresholds: (thresholds: RsiThresholdFillThresholds) => void
  setVisible: (visible: boolean) => void
  update: () => void
  dispose: () => void
}

/**
 * Attach the RSI threshold fill to the existing RSI line series.
 *
 * Deliberately has no `autoscaleInfo`: the fill must never influence the RSI
 * pane's autoscale / visible range, it only paints behind the line.
 */
export function attachRsiThresholdFillSeriesPrimitive(
  series: ISeriesApi<'Line', Time>,
  initialContext: RsiThresholdFillSeriesPrimitiveContext,
): RsiThresholdFillSeriesAttachment {
  let context = initialContext
  const primitive = new RsiThresholdFillSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)

  return {
    setData: (points, thresholds) => {
      context = { ...context, points, thresholds }
      primitive.updateAllViews()
    },
    setThresholds: (thresholds) => {
      // Re-segment the already stored points with the new thresholds; no
      // candle refetch and no history re-send are needed.
      context = { ...context, thresholds }
      primitive.updateAllViews()
    },
    setVisible: (visible) => {
      context = { ...context, visible }
      primitive.updateAllViews()
    },
    update: () => {
      primitive.updateAllViews()
    },
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
