import type { UTCTimestamp } from 'lightweight-charts'
import type { DottedLineAnchor, DottedLineInstance } from './dottedLineInstances.ts'
import {
  DOTTED_LINE_DASH_PATTERN_CSS_PX,
  DOTTED_LINE_WIDTH_CSS_PX,
  readDottedLineStrokeStyle,
} from './dottedLineStrokeStyle.ts'
import type { DottedLineDraft } from './dottedLineInteraction.ts'

export type DottedLineSegmentGeometry = {
  x1: number
  y1: number
  x2: number
  y2: number
  strokeStyle: string
  lineDash: readonly number[]
  lineWidthCssPx: number
}

export type DottedLineRenderContext = {
  instances: readonly DottedLineInstance[]
  draft: DottedLineDraft | null
  timeToCoordinate: (time: number) => number | null
  priceToCoordinate: (price: number) => number | null
  strokeStyle?: string
}

function anchorToPixel(
  anchor: DottedLineAnchor,
  timeToCoordinate: (time: number) => number | null,
  priceToCoordinate: (price: number) => number | null,
): { x: number; y: number } | null {
  const x = timeToCoordinate(anchor.time)
  const y = priceToCoordinate(anchor.price)
  if (x === null || y === null) return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

export function buildDottedLineSegmentGeometries(
  context: DottedLineRenderContext,
): DottedLineSegmentGeometry[] {
  const strokeStyle = context.strokeStyle ?? readDottedLineStrokeStyle()
  const segments: DottedLineSegmentGeometry[] = []

  const pushSegment = (from: DottedLineAnchor, to: DottedLineAnchor) => {
    const start = anchorToPixel(from, context.timeToCoordinate, context.priceToCoordinate)
    const end = anchorToPixel(to, context.timeToCoordinate, context.priceToCoordinate)
    if (!start || !end) return
    segments.push({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      strokeStyle,
      lineDash: DOTTED_LINE_DASH_PATTERN_CSS_PX,
      lineWidthCssPx: DOTTED_LINE_WIDTH_CSS_PX,
    })
  }

  for (const instance of context.instances) {
    pushSegment(
      { time: instance.fromTime, price: instance.fromPrice },
      { time: instance.toTime, price: instance.toPrice },
    )
  }

  if (context.draft) {
    pushSegment(context.draft.anchor, context.draft.preview)
  }

  return segments
}

export function createDottedLineCoordinateMappers(
  timeToCoordinate: (time: UTCTimestamp) => number | null,
  priceToY: (price: number) => number | null,
): {
  timeToCoordinate: (time: number) => number | null
  priceToCoordinate: (price: number) => number | null
} {
  return {
    timeToCoordinate: (time) => timeToCoordinate(time as UTCTimestamp),
    priceToCoordinate: priceToY,
  }
}
