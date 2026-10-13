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
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import { anchorScreenYFromPoints } from './anchoredVwapDrawingHitTest.ts'
import type { AnchoredVwapDrawingInteractionState } from './anchoredVwapDrawingInteraction.ts'
import {
  isAnchoredVwapInstanceHidden,
  type AnchoredVwapInstance,
} from './anchoredVwapInstances.ts'
import { readLineHandleFillStyle } from './lineColors.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
} from './rectangleChartTime.ts'
import type { MarketCandle } from './types.ts'

export type AnchoredVwapDrawingPrimitiveContext = {
  instances: readonly AnchoredVwapInstance[]
  interaction: AnchoredVwapDrawingInteractionState
  candles: readonly MarketCandle[]
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
}

const HANDLE_RADIUS_PX = 4

class AnchoredVwapHandleRenderer implements IPrimitivePaneRenderer {
  private readonly _handles: { x: number; y: number }[]
  private readonly _fillStyle: string

  constructor(handles: { x: number; y: number }[], fillStyle: string) {
    this._handles = handles
    this._fillStyle = fillStyle
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._handles.length === 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()
      for (const handle of this._handles) {
        const hx = Math.round(handle.x * horizontalPixelRatio)
        const hy = Math.round(handle.y * verticalPixelRatio)
        const radius = HANDLE_RADIUS_PX * horizontalPixelRatio
        context.beginPath()
        context.fillStyle = this._fillStyle
        context.arc(hx, hy, radius, 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
    })
  }
}

class AnchoredVwapHandlePaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => AnchoredVwapDrawingPrimitiveContext
  private _handles: { x: number; y: number }[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapDrawingPrimitiveContext,
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
    this._getContext = getContext
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return new AnchoredVwapHandleRenderer(this._handles, readLineHandleFillStyle())
  }

  update(): void {
    const chart = this._getChart()
    const series = this._getSeries()
    if (!chart || !series) {
      this._handles = []
      return
    }
    const ctx = this._getContext()
    const selectedId = ctx.interaction.selectedId
    if (!selectedId) {
      this._handles = []
      return
    }
    const instance = ctx.instances.find((item) => item.id === selectedId)
    if (!instance || isAnchoredVwapInstanceHidden(instance)) {
      this._handles = []
      return
    }
    const timeContext = buildRectangleChartTimeContext(
      chart,
      ctx.lastBarUnixTime,
      ctx.intervalDurationSeconds,
    )
    const anchorX = resolveRectangleTimeToCoordinate(
      chart,
      instance.anchorTime,
      'start',
      timeContext,
    )
    const points = computeAnchoredVwapDrawingPointsForInstance(ctx.candles, instance)
    const anchorY = anchorScreenYFromPoints(points, (price) => series.priceToCoordinate(price))
    if (anchorX === null || anchorY === null) {
      this._handles = []
      return
    }
    this._handles = [{ x: anchorX, y: anchorY }]
  }
}

class AnchoredVwapDrawingSeriesPrimitive implements ISeriesPrimitive<Time> {
  private readonly _paneView: AnchoredVwapHandlePaneView

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapDrawingPrimitiveContext,
  ) {
    this._paneView = new AnchoredVwapHandlePaneView(getChart, getSeries, getContext)
  }

  paneViews() {
    return [this._paneView]
  }

  updateAllViews(): void {
    this._paneView.update()
  }
}

export type AnchoredVwapDrawingSeriesAttachment = {
  update: () => void
  dispose: () => void
}

export function attachAnchoredVwapDrawingSeriesPrimitive(
  series: ISeriesApi<SeriesType, Time>,
  getContext: () => AnchoredVwapDrawingPrimitiveContext,
  getChart: () => IChartApi | null,
): AnchoredVwapDrawingSeriesAttachment {
  const primitive = new AnchoredVwapDrawingSeriesPrimitive(getChart, () => series, getContext)
  series.attachPrimitive(primitive)
  return {
    update: () => primitive.updateAllViews(),
    dispose: () => {
      series.detachPrimitive(primitive)
    },
  }
}
