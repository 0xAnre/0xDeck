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
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
} from './rectangleChartTime.ts'
import { readRectangleFillStyle, readRectangleHandleFillStyle } from './rectangleColors.ts'
import {
  buildRectangleDrawModels,
  type RectangleDrawModel,
} from './rectangleRenderGeometry.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import type { RectangleInteractionState } from './rectangleInteraction.ts'

export type RectangleSeriesPrimitiveContext = {
  instances: readonly RectangleInstance[]
  interaction: RectangleInteractionState
  pointerTime: number | null
  pointerPrice: number | null
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
}

const RECTANGLE_HANDLE_DRAW_RADIUS_PX = 4

function bitmapBox(start: number, end: number, pixelRatio: number): { position: number; length: number } {
  const position = Math.round(Math.min(start, end) * pixelRatio)
  const length = Math.round(Math.abs(end - start) * pixelRatio)
  return { position, length }
}

class RectangleRenderer implements IPrimitivePaneRenderer {
  private readonly _models: RectangleDrawModel[]
  private readonly _handleFillStyle: string

  constructor(models: RectangleDrawModel[], handleFillStyle: string) {
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

      for (const model of this._models) {
        const left = Math.round(model.left * horizontalPixelRatio)
        const right = Math.round(model.right * horizontalPixelRatio)
        const topBox = bitmapBox(model.top, model.bottom, verticalPixelRatio)
        const width = Math.max(0, right - left)
        const height = topBox.length
        if (width > 0 && height > 0) {
          context.fillStyle = model.fillStyle
          context.fillRect(left, topBox.position, width, height)
        }

        for (const handle of model.handles) {
          const hx = Math.round(handle.x * horizontalPixelRatio)
          const hy = Math.round(handle.y * verticalPixelRatio)
          const radius = RECTANGLE_HANDLE_DRAW_RADIUS_PX * horizontalPixelRatio
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

class RectanglePaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => RectangleSeriesPrimitiveContext
  private _models: RectangleDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => RectangleSeriesPrimitiveContext,
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
    const timeContext = buildRectangleChartTimeContext(
      chart,
      context.lastBarUnixTime,
      context.intervalDurationSeconds,
    )
    this._models = buildRectangleDrawModels({
      instances: context.instances,
      interaction: context.interaction,
      fillStyle: readRectangleFillStyle(),
      handleFillStyle: readRectangleHandleFillStyle(),
      pointerTime: context.pointerTime,
      pointerPrice: context.pointerPrice,
      timeToCoordinate: (time, edge) =>
        resolveRectangleTimeToCoordinate(chart, time, edge, timeContext),
      priceToY: (price) => series.priceToCoordinate(price),
      handleRadiusPx: RECTANGLE_HANDLE_DRAW_RADIUS_PX,
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new RectangleRenderer(this._models, readRectangleHandleFillStyle())
  }
}

export class RectangleSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => RectangleSeriesPrimitiveContext = () => ({
    instances: [],
    interaction: { phase: 'inactive', selectedId: null, draft: null },
    pointerTime: null,
    pointerPrice: null,
    intervalDurationSeconds: 60,
    lastBarUnixTime: null,
  })
  private readonly _view: RectanglePaneView

  constructor(getContext: () => RectangleSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new RectanglePaneView(
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

export function attachRectangleSeriesPrimitive(
  series: ISeriesApi<'Candlestick', Time>,
  getContext: () => RectangleSeriesPrimitiveContext,
): {
  update: () => void
  dispose: () => void
} {
  const primitive = new RectangleSeriesPrimitive(getContext)
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
