import type { LineInstance } from './lineInstances.ts'

export type LineEndpointKind = 'endpoint-a' | 'endpoint-b'

export type LineHandleKind = LineEndpointKind | 'body'

export type LineScreenSegment = {
  ax: number
  ay: number
  bx: number
  by: number
}

export type LineHitTarget = {
  instanceId: string
  kind: LineHandleKind
  priority: number
  instanceIndex: number
}

export const LINE_HANDLE_HIT_RADIUS_PX = 6

const ENDPOINT_PRIORITY = 3
const BODY_PRIORITY = 1

function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

function hitEndpoint(
  paneX: number,
  paneY: number,
  x: number,
  y: number,
  radiusSq: number,
): boolean {
  return distanceSq(paneX, paneY, x, y) <= radiusSq
}

function hitBodySegment(
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

function hitTestSingleLine(
  instanceId: string,
  instanceIndex: number,
  segment: LineScreenSegment,
  paneX: number,
  paneY: number,
  radiusSq: number,
  allowHandles: boolean,
): LineHitTarget | null {
  const { ax, ay, bx, by } = segment

  if (allowHandles) {
    if (hitEndpoint(paneX, paneY, ax, ay, radiusSq)) {
      return { instanceId, kind: 'endpoint-a', priority: ENDPOINT_PRIORITY, instanceIndex }
    }
    if (hitEndpoint(paneX, paneY, bx, by, radiusSq)) {
      return { instanceId, kind: 'endpoint-b', priority: ENDPOINT_PRIORITY, instanceIndex }
    }
  }

  if (hitBodySegment(paneX, paneY, ax, ay, bx, by, radiusSq)) {
    return { instanceId, kind: 'body', priority: BODY_PRIORITY, instanceIndex }
  }

  return null
}

export function hitTestLines(
  instances: readonly LineInstance[],
  selectedId: string | null,
  paneX: number,
  paneY: number,
  project: (instance: LineInstance) => LineScreenSegment | null,
  hitRadiusPx: number = LINE_HANDLE_HIT_RADIUS_PX,
): LineHitTarget | null {
  if (!Number.isFinite(paneX) || !Number.isFinite(paneY)) return null
  const radiusSq = hitRadiusPx * hitRadiusPx
  let best: LineHitTarget | null = null

  for (let index = instances.length - 1; index >= 0; index -= 1) {
    const instance = instances[index]
    const segment = project(instance)
    if (!segment) continue
    const allowHandles = selectedId === instance.id
    const hit = hitTestSingleLine(
      instance.id,
      index,
      segment,
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

export function isLineEndpointHandle(kind: LineHandleKind): boolean {
  return kind === 'endpoint-a' || kind === 'endpoint-b'
}
