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
import { buildLineChartTimeContext, resolveLineTimeToCoordinate } from './lineChartTime.ts'
import {
  LINE_DASH_PATTERN_CSS_PX,
  LINE_WIDTH_CSS_PX,
  readLineHandleFillStyle,
  readLineStrokeStyle,
} from './lineColors.ts'
import { buildLineDrawModels, type LineDrawModel } from './lineRenderGeometry.ts'
import type { LineInstance } from './lineInstances.ts'
import type { LineInteractionState } from './lineInteraction.ts'

export type LineSeriesPrimitiveContext = {
  instances: readonly LineInstance[]
  interaction: LineInteractionState
  pointerTime: number | null
  pointerPrice: number | null
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
}

const LINE_HANDLE_DRAW_RADIUS_PX = 4

class LineRenderer implements IPrimitivePaneRenderer {
  private readonly _models: LineDrawModel[]
  private readonly _handleFillStyle: string

  constructor(models: LineDrawModel[], handleFillStyle: string) {
    this._models = models
    this._handleFillStyle = handleFillStyle
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._models.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()

      const dashPattern = LINE_DASH_PATTERN_CSS_PX.map(
        (value) => value * horizontalPixelRatio,
      )
      const lineWidth = LINE_WIDTH_CSS_PX * horizontalPixelRatio

      for (const model of this._models) {
        const ax = Math.round(model.ax * horizontalPixelRatio)
        const ay = Math.round(model.ay * verticalPixelRatio)
        const bx = Math.round(model.bx * horizontalPixelRatio)
        const by = Math.round(model.by * verticalPixelRatio)

        context.beginPath()
        context.strokeStyle = model.strokeStyle
        context.lineWidth = lineWidth
        context.setLineDash(dashPattern)
        context.moveTo(ax, ay)
        context.lineTo(bx, by)
        context.stroke()
        context.setLineDash([])

        for (const handle of model.handles) {
          const hx = Math.round(handle.x * horizontalPixelRatio)
          const hy = Math.round(handle.y * verticalPixelRatio)
          const radius = LINE_HANDLE_DRAW_RADIUS_PX * horizontalPixelRatio
          context.beginPath()
          context.fillStyle = this._handleFillStyle
          context.arc(hx, hy, radius, 0, Math.PI * 2)
          context.fill()
        }
      }

      context.restore()
    })
  }
}

class LinePaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => LineSeriesPrimitiveContext
  private _models: LineDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => LineSeriesPrimitiveContext,
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

    const context = this._getContext()
    const timeContext = buildLineChartTimeContext(
      chart,
      context.lastBarUnixTime,
      context.intervalDurationSeconds,
    )
    this._models = buildLineDrawModels({
      instances: context.instances,
      interaction: context.interaction,
      strokeStyle: readLineStrokeStyle(),
      pointerTime: context.pointerTime,
      pointerPrice: context.pointerPrice,
      timeToCoordinate: (time, edge) => resolveLineTimeToCoordinate(chart, time, edge, timeContext),
      priceToY: (price) => series.priceToCoordinate(price),
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new LineRenderer(this._models, readLineHandleFillStyle())
  }
}

export class LineSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => LineSeriesPrimitiveContext = () => ({
    instances: [],
    interaction: { phase: 'inactive', selectedId: null, draft: null },
    pointerTime: null,
    pointerPrice: null,
    intervalDurationSeconds: 60,
    lastBarUnixTime: null,
  })
  private readonly _view: LinePaneView

  constructor(getContext: () => LineSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new LinePaneView(
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

export function attachLineSeriesPrimitive(
  series: ISeriesApi<'Candlestick', Time>,
  getContext: () => LineSeriesPrimitiveContext,
): {
  update: () => void
  dispose: () => void
} {
  const primitive = new LineSeriesPrimitive(getContext)
  series.attachPrimitive(primitive)
  return {
    update: () => {
      primitive.updateAllViews()
    },
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
