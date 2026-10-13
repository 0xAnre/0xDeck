import { isAnchoredVwapInstanceHidden, type AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { AnchoredVwapDrawingPoint } from './anchoredVwapDrawing.ts'

export type AnchoredVwapDrawingHandleKind = 'anchor'

export type AnchoredVwapDrawingHitTarget = {
  instanceId: string
  kind: AnchoredVwapDrawingHandleKind | 'body'
}

const ANCHOR_HANDLE_RADIUS_PX = 6
const BODY_HIT_TOLERANCE_PX = 4

export function hitTestAnchoredVwapDrawings(
  instances: readonly AnchoredVwapInstance[],
  selectedId: string | null,
  paneX: number,
  paneY: number,
  project: (instance: AnchoredVwapInstance) => {
    anchorX: number | null
    anchorY: number | null
    bodySegments: { x1: number; y1: number; x2: number; y2: number }[]
  } | null,
): AnchoredVwapDrawingHitTarget | null {
  const visible = instances.filter((item) => !isAnchoredVwapInstanceHidden(item))
  const ordered = [...visible].sort((a, b) => {
    if (a.id === selectedId) return -1
    if (b.id === selectedId) return 1
    return b.displaySequence - a.displaySequence
  })

  for (let index = 0; index < ordered.length; index += 1) {
    const instance = ordered[index]
    const projection = project(instance)
    if (!projection) continue
    const { anchorX, anchorY, bodySegments } = projection
    if (anchorX !== null && anchorY !== null) {
      const dx = paneX - anchorX
      const dy = paneY - anchorY
      if (dx * dx + dy * dy <= ANCHOR_HANDLE_RADIUS_PX * ANCHOR_HANDLE_RADIUS_PX) {
        return { instanceId: instance.id, kind: 'anchor' }
      }
    }
    for (const segment of bodySegments) {
      if (distancePointToSegment(paneX, paneY, segment) <= BODY_HIT_TOLERANCE_PX) {
        return { instanceId: instance.id, kind: 'body' }
      }
    }
  }
  return null
}

function distancePointToSegment(
  px: number,
  py: number,
  segment: { x1: number; y1: number; x2: number; y2: number },
): number {
  const { x1, y1, x2, y2 } = segment
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1)
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}

export function anchorScreenYFromPoints(
  points: readonly AnchoredVwapDrawingPoint[],
  priceToCoordinate: (price: number) => number | null,
): number | null {
  const first = points.find((point) => point.vwap !== null)
  if (!first || first.vwap === null) return null
  return priceToCoordinate(first.vwap)
}
