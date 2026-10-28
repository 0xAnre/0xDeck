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
import { resolveVisibleLineSegmentIndexBounds } from './chartObjectSeriesLineHit.ts'
import { MARKET_STYLE_PALETTE } from './marketStylePalette.ts'

/**
 * Selection feedback for overlay indicators.
 *
 * Drawing tools show a selection through their render geometry (outline and
 * handles). An overlay indicator has no geometry of its own, so the same
 * "selected object is outlined" language is rendered as a temporary halo: the
 * selected lines are stroked wider in their own color, above the series. The
 * halo is chart chrome only — it is not stored, and it never writes to the
 * series options, so the user's color, opacity, width and style stay untouched.
 */
export const OVERLAY_SELECTION_HALO_ALPHA = 0.3
export const OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX = 5
export const OVERLAY_SELECTION_HALO_FALLBACK_COLOR = MARKET_STYLE_PALETTE.medium

export type OverlaySelectionHaloPoint = {
  x: number
  y: number
}

export type OverlaySelectionHaloStroke = {
  points: readonly OverlaySelectionHaloPoint[]
  color: string
  lineWidthPx: number
}

type SeriesDataPoint = { time: Time; value: number } | null

/** Halo stroke width: the series' own width plus a fixed visual band. */
export function overlaySelectionHaloWidth(lineWidth: unknown): number {
  const base = typeof lineWidth === 'number' && Number.isFinite(lineWidth) ? lineWidth : 1
  return Math.max(1, base) + OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX
}

/**
 * Screen polylines for the halo. `null` data points (gaps in a line) split the
 * path so the halo never bridges a gap the series itself does not draw.
 */
export function buildOverlaySelectionHaloPolylines(
  points: readonly SeriesDataPoint[],
  timeToX: (time: Time) => number | null,
  valueToY: (value: number) => number | null,
): OverlaySelectionHaloPoint[][] {
  const polylines: OverlaySelectionHaloPoint[][] = []
  let current: OverlaySelectionHaloPoint[] = []

  for (const point of points) {
    const x = point ? timeToX(point.time) : null
    const y = point ? valueToY(point.value) : null
    if (x === null || y === null) {
      if (current.length > 1) polylines.push(current)
      current = []
      continue
    }
    current.push({ x, y })
  }

  if (current.length > 1) polylines.push(current)
  return polylines
}

function seriesColor(series: ISeriesApi<'Line', Time>): string {
  const color = series.options().color
  return typeof color === 'string' && color.length > 0
    ? color
    : OVERLAY_SELECTION_HALO_FALLBACK_COLOR
}

function seriesDataPoint(series: ISeriesApi<'Line', Time>, logical: number): SeriesDataPoint {
  const point = series.dataByIndex(logical)
  if (point === null || !('value' in point)) return null
  if (point.value === undefined || !Number.isFinite(point.value)) return null
  return { time: point.time, value: point.value }
}

class OverlaySelectionHaloRenderer implements IPrimitivePaneRenderer {
  private readonly _strokes: readonly OverlaySelectionHaloStroke[]

  constructor(strokes: readonly OverlaySelectionHaloStroke[]) {
    this._strokes = strokes
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._strokes.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio } = scope
      context.save()
      context.globalAlpha = OVERLAY_SELECTION_HALO_ALPHA
      context.lineJoin = 'round'
      context.lineCap = 'round'

      for (const stroke of this._strokes) {
        if (stroke.points.length < 2) continue
        context.beginPath()
        for (let index = 0; index < stroke.points.length; index += 1) {
          const point = stroke.points[index]
          const x = point.x * horizontalPixelRatio
          const y = point.y * verticalPixelRatio
          if (index === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.strokeStyle = stroke.color
        context.lineWidth = stroke.lineWidthPx * horizontalPixelRatio
        context.stroke()
      }

      context.restore()
    })
  }
}

class OverlaySelectionHaloPaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => readonly ISeriesApi<'Line', Time>[]
  private _strokes: OverlaySelectionHaloStroke[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => readonly ISeriesApi<'Line', Time>[],
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
  }

  zOrder(): 'top' {
    return 'top'
  }

  update(): void {
    const chart = this._getChart()
    const strokes: OverlaySelectionHaloStroke[] = []
    if (!chart) {
      this._strokes = strokes
      return
    }

    const timeScale = chart.timeScale()
    for (const series of this._getSeries()) {
      if (!series.options().visible) continue
      const { startIndex, endIndex } = resolveVisibleLineSegmentIndexBounds(chart, series)
      if (endIndex < startIndex) continue
      const points: SeriesDataPoint[] = []
      for (let logical = startIndex; logical <= endIndex + 1; logical += 1) {
        points.push(seriesDataPoint(series, logical))
      }
      const polylines = buildOverlaySelectionHaloPolylines(
        points,
        (time) => timeScale.timeToCoordinate(time),
        (value) => series.priceToCoordinate(value),
      )
      for (const polyline of polylines) {
        strokes.push({
          points: polyline,
          color: seriesColor(series),
          lineWidthPx: overlaySelectionHaloWidth(series.options().lineWidth),
        })
      }
    }

    this._strokes = strokes
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._strokes.length === 0) return null
    return new OverlaySelectionHaloRenderer(this._strokes)
  }
}

export class OverlayIndicatorSelectionHaloPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private readonly _getSeries: () => readonly ISeriesApi<'Line', Time>[]
  private readonly _view: OverlaySelectionHaloPaneView

  constructor(getSeries: () => readonly ISeriesApi<'Line', Time>[]) {
    this._getSeries = getSeries
    this._view = new OverlaySelectionHaloPaneView(
      () => this._chart,
      () => this._getSeries(),
    )
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }

  updateAllViews(): void {
    this._view.update()
  }

  attached(param: { chart: IChartApi }): void {
    this._chart = param.chart
    this.updateAllViews()
  }

  detached(): void {
    this._chart = null
  }
}

export type OverlayIndicatorSelectionHaloAttachment = {
  update: () => void
  dispose: () => void
}

/**
 * Attach the selection halo to the pane host series (`bundle.candle` for
 * candle-pane overlays, the RSI series for the RSI pane). The target lines are
 * resolved lazily on every paint so a rebuilt series or a style change cannot
 * leave a stale halo behind.
 */
export function attachOverlayIndicatorSelectionHalo(
  host: ISeriesApi<SeriesType, Time>,
  getSeries: () => readonly ISeriesApi<'Line', Time>[],
): OverlayIndicatorSelectionHaloAttachment {
  const primitive = new OverlayIndicatorSelectionHaloPrimitive(getSeries)
  host.attachPrimitive(primitive)
  return {
    update: () => primitive.updateAllViews(),
    dispose: () => {
      host.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
