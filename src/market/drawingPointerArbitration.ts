import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { hitTestLines, type LineHandleKind, type LineHitTarget } from './lineHitTest.ts'
import type { LineInstance } from './lineInstances.ts'
import { projectLineInstanceToScreenSegment } from './lineRenderGeometry.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
} from './rectangleChartTime.ts'
import {
  hitTestRectangles,
  type RectangleHandleKind,
  type RectangleHitTarget,
} from './rectangleHitTest.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import { projectRectangleInstanceToScreenBox } from './rectangleRenderGeometry.ts'

export type DrawingPointerTool = 'line' | 'rectangle'

const LINE_ENDPOINT_SPECIFICITY = 40
const RECTANGLE_CORNER_SPECIFICITY = 40
const RECTANGLE_EDGE_SPECIFICITY = 30
const LINE_BODY_SPECIFICITY = 20
const RECTANGLE_INTERIOR_SPECIFICITY = 10

function lineHitSpecificity(kind: LineHandleKind): number {
  switch (kind) {
    case 'endpoint-a':
    case 'endpoint-b':
      return LINE_ENDPOINT_SPECIFICITY
    case 'body':
      return LINE_BODY_SPECIFICITY
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

function rectangleHitSpecificity(kind: RectangleHandleKind): number {
  switch (kind) {
    case 'corner-nw':
    case 'corner-ne':
    case 'corner-se':
    case 'corner-sw':
      return RECTANGLE_CORNER_SPECIFICITY
    case 'edge-n':
    case 'edge-e':
    case 'edge-s':
    case 'edge-w':
      return RECTANGLE_EDGE_SPECIFICITY
    case 'interior':
      return RECTANGLE_INTERIOR_SPECIFICITY
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

/**
 * Chooses which drawing receives the pointer when both tools hit the same point.
 * A line stroke outranks a rectangle fill. Equal specificity prefers the line
 * because the line primitive is attached above rectangles.
 */
export function preferDrawingPointerTarget(
  lineHit: LineHitTarget | null,
  rectangleHit: RectangleHitTarget | null,
): DrawingPointerTool | null {
  if (lineHit && !rectangleHit) return 'line'
  if (rectangleHit && !lineHit) return 'rectangle'
  if (!lineHit || !rectangleHit) return null
  const lineScore = lineHitSpecificity(lineHit.kind)
  const rectangleScore = rectangleHitSpecificity(rectangleHit.kind)
  if (lineScore >= rectangleScore) return 'line'
  return 'rectangle'
}

type PaneHitArgs = {
  chart: IChartApi
  series: ISeriesApi<SeriesType, Time>
  paneX: number
  paneY: number
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
}

export function lineHitAtPanePoint(
  args: PaneHitArgs & {
    instances: readonly LineInstance[]
    selectedId: string | null
  },
): LineHitTarget | null {
  const timeContext = buildRectangleChartTimeContext(
    args.chart,
    args.lastBarUnixTime,
    args.intervalDurationSeconds,
  )
  return hitTestLines(args.instances, args.selectedId, args.paneX, args.paneY, (instance) =>
    projectLineInstanceToScreenSegment(
      instance,
      (time, edge) => resolveRectangleTimeToCoordinate(args.chart, time, edge, timeContext),
      (price) => args.series.priceToCoordinate(price),
    ),
  )
}

export function rectangleHitAtPanePoint(
  args: PaneHitArgs & {
    instances: readonly RectangleInstance[]
    selectedId: string | null
  },
): RectangleHitTarget | null {
  const timeContext = buildRectangleChartTimeContext(
    args.chart,
    args.lastBarUnixTime,
    args.intervalDurationSeconds,
  )
  return hitTestRectangles(args.instances, args.selectedId, args.paneX, args.paneY, (instance) =>
    projectRectangleInstanceToScreenBox(
      instance,
      (time, edge) => resolveRectangleTimeToCoordinate(args.chart, time, edge, timeContext),
      (price) => args.series.priceToCoordinate(price),
    ),
  )
}
