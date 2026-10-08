import { isRectangleInstanceLocked, type RectangleInstance } from './rectangleInstances.ts'

export type RectangleHandleKind =
  | 'corner-nw'
  | 'corner-ne'
  | 'corner-se'
  | 'corner-sw'
  | 'edge-n'
  | 'edge-e'
  | 'edge-s'
  | 'edge-w'
  | 'interior'

export type RectangleScreenBox = {
  left: number
  right: number
  top: number
  bottom: number
}

export type RectangleHitTarget = {
  instanceId: string
  kind: RectangleHandleKind
  priority: number
  instanceIndex: number
}

export const RECTANGLE_HANDLE_HIT_RADIUS_PX = 6

const CORNER_PRIORITY = 3
const EDGE_PRIORITY = 2
const INTERIOR_PRIORITY = 1

function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

function hitCorner(
  paneX: number,
  paneY: number,
  x: number,
  y: number,
  radiusSq: number,
): boolean {
  return distanceSq(paneX, paneY, x, y) <= radiusSq
}

function hitEdgeSegment(
  paneX: number,
  paneY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radiusSq: number,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return distanceSq(paneX, paneY, x1, y1) <= radiusSq
  }
  const t = Math.max(0, Math.min(1, ((paneX - x1) * dx + (paneY - y1) * dy) / lengthSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return distanceSq(paneX, paneY, projX, projY) <= radiusSq
}

function hitTestSingleRectangleBox(
  instanceId: string,
  instanceIndex: number,
  box: RectangleScreenBox,
  paneX: number,
  paneY: number,
  radiusSq: number,
  allowHandles: boolean,
): RectangleHitTarget | null {
  const { left, right, top, bottom } = box

  if (allowHandles) {
    if (hitCorner(paneX, paneY, left, top, radiusSq)) {
      return { instanceId, kind: 'corner-nw', priority: CORNER_PRIORITY, instanceIndex }
    }
    if (hitCorner(paneX, paneY, right, top, radiusSq)) {
      return { instanceId, kind: 'corner-ne', priority: CORNER_PRIORITY, instanceIndex }
    }
    if (hitCorner(paneX, paneY, right, bottom, radiusSq)) {
      return { instanceId, kind: 'corner-se', priority: CORNER_PRIORITY, instanceIndex }
    }
    if (hitCorner(paneX, paneY, left, bottom, radiusSq)) {
      return { instanceId, kind: 'corner-sw', priority: CORNER_PRIORITY, instanceIndex }
    }
    if (hitEdgeSegment(paneX, paneY, left, top, right, top, radiusSq)) {
      return { instanceId, kind: 'edge-n', priority: EDGE_PRIORITY, instanceIndex }
    }
    if (hitEdgeSegment(paneX, paneY, right, top, right, bottom, radiusSq)) {
      return { instanceId, kind: 'edge-e', priority: EDGE_PRIORITY, instanceIndex }
    }
    if (hitEdgeSegment(paneX, paneY, left, bottom, right, bottom, radiusSq)) {
      return { instanceId, kind: 'edge-s', priority: EDGE_PRIORITY, instanceIndex }
    }
    if (hitEdgeSegment(paneX, paneY, left, top, left, bottom, radiusSq)) {
      return { instanceId, kind: 'edge-w', priority: EDGE_PRIORITY, instanceIndex }
    }
  }

  const withinX = paneX >= left && paneX <= right
  const withinY = paneY >= top && paneY <= bottom
  if (withinX && withinY) {
    return { instanceId, kind: 'interior', priority: INTERIOR_PRIORITY, instanceIndex }
  }

  return null
}

export function hitTestRectangles(
  instances: readonly RectangleInstance[],
  selectedId: string | null,
  paneX: number,
  paneY: number,
  project: (instance: RectangleInstance) => RectangleScreenBox | null,
  hitRadiusPx: number = RECTANGLE_HANDLE_HIT_RADIUS_PX,
): RectangleHitTarget | null {
  if (!Number.isFinite(paneX) || !Number.isFinite(paneY)) return null
  const radiusSq = hitRadiusPx * hitRadiusPx
  let best: RectangleHitTarget | null = null

  for (let index = instances.length - 1; index >= 0; index -= 1) {
    const instance = instances[index]
    const box = project(instance)
    if (!box) continue
    const allowHandles =
      selectedId === instance.id && !isRectangleInstanceLocked(instance)
    const hit = hitTestSingleRectangleBox(
      instance.id,
      index,
      box,
      paneX,
      paneY,
      radiusSq,
      allowHandles,
    )
    if (!hit) continue
    if (
      !best ||
      hit.priority > best.priority ||
      (hit.priority === best.priority && hit.instanceIndex > best.instanceIndex)
    ) {
      best = hit
    }
  }

  return best
}

export function isRectangleResizeHandle(kind: RectangleHandleKind): boolean {
  return kind !== 'interior'
}
