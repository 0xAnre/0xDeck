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
import type { DottedLineInstance } from './dottedLineInstances.ts'
import type { DottedLineDraft } from './dottedLineInteraction.ts'
import {
  buildDottedLineSegmentGeometries,
  createDottedLineCoordinateMappers,
  type DottedLineSegmentGeometry,
} from './dottedLineRenderGeometry.ts'

export type DottedLineSeriesPrimitiveContext = {
  instances: readonly DottedLineInstance[]
  draft: DottedLineDraft | null
}

class DottedLineRenderer implements IPrimitivePaneRenderer {
  private readonly _segments: DottedLineSegmentGeometry[]

  constructor(segments: DottedLineSegmentGeometry[]) {
    this._segments = segments
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._segments.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()

      for (const segment of this._segments) {
        const x1 = Math.round(segment.x1 * horizontalPixelRatio)
        const y1 = Math.round(segment.y1 * verticalPixelRatio)
        const x2 = Math.round(segment.x2 * horizontalPixelRatio)
        const y2 = Math.round(segment.y2 * verticalPixelRatio)
        context.save()
        context.beginPath()
        context.setLineDash(
          segment.lineDash.map((value) => value * Math.max(horizontalPixelRatio, verticalPixelRatio)),
        )
        context.strokeStyle = segment.strokeStyle
        context.lineWidth = segment.lineWidthCssPx * verticalPixelRatio
        context.moveTo(x1, y1)
        context.lineTo(x2, y2)
        context.stroke()
        context.restore()
      }

      context.restore()
    })
  }
}

class DottedLinePaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => DottedLineSeriesPrimitiveContext
  private _segments: DottedLineSegmentGeometry[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => DottedLineSeriesPrimitiveContext,
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
      this._segments = []
      return
    }

    const timeScale = chart.timeScale()
    const mappers = createDottedLineCoordinateMappers(
      (time) => timeScale.timeToCoordinate(time),
      (price) => series.priceToCoordinate(price),
    )

    const context = this._getContext()
    this._segments = buildDottedLineSegmentGeometries({
      instances: context.instances,
      draft: context.draft,
      ...mappers,
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._segments.length === 0) return null
    return new DottedLineRenderer(this._segments)
  }
}

export class DottedLineSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => DottedLineSeriesPrimitiveContext = () => ({
    instances: [],
    draft: null,
  })
  private readonly _view: DottedLinePaneView

  constructor(getContext: () => DottedLineSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new DottedLinePaneView(
      () => this._chart,
      () => this._series,
      () => this._getContext(),
    )
  }

  setContextProvider(getContext: () => DottedLineSeriesPrimitiveContext): void {
    this._getContext = getContext
    this.updateAllViews()
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

export function attachDottedLineSeriesPrimitive(
  series: ISeriesApi<'Candlestick', Time>,
  getContext: () => DottedLineSeriesPrimitiveContext,
): {
  primitive: DottedLineSeriesPrimitive
  dispose: () => void
  update: () => void
} {
  const primitive = new DottedLineSeriesPrimitive(getContext)
  series.attachPrimitive(primitive)
  return {
    primitive,
    update: () => primitive.updateAllViews(),
    dispose: () => {
      series.detachPrimitive(primitive)
    },
  }
}
