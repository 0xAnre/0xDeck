import {
  isFixedRangeVolumeProfileInstanceHidden,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileInstanceDrawModel } from './fixedRangeVolumeProfileRenderGeometry.ts'

export type FixedRangeVolumeProfileHandleKind = 'start' | 'end' | 'body'

export type FixedRangeVolumeProfileHitTarget = {
  instanceId: string
  kind: FixedRangeVolumeProfileHandleKind
  priority: number
  instanceIndex: number
}

export const FRVP_ENDPOINT_HANDLE_HIT_RADIUS_PX = 6

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

/**
 * Body hit region of one fixed-range volume profile.
 *
 * The region is the profile's own rectangle — the full `rangeLeft .. rangeRight`
 * span across the price extent of its histogram rows — plus the existing row and
 * level-line regions. The rectangle makes selection independent of the level
 * render mode: `step` hides a group's flat line and the developing staircase is
 * deliberately not a hit target, but the rectangle still covers the whole
 * profile, so a profile is equally selectable in `line`, `step` and `both`.
 *
 * Shared by the FRVP pointer path (selection, cursor) and the chart-object
 * settings hit test (double click), so both resolve the same body.
 */
export function hitTestFixedRangeVolumeProfileBody(
  model: FixedRangeVolumeProfileInstanceDrawModel,
  paneX: number,
  paneY: number,
  tolerancePx: number,
): boolean {
  if (paneX < model.rangeLeft - tolerancePx || paneX > model.rangeRight + tolerancePx) {
    return false
  }

  let profileTop = Number.POSITIVE_INFINITY
  let profileBottom = Number.NEGATIVE_INFINITY
  for (const row of model.rows) {
    if (row.top < profileTop) profileTop = row.top
    if (row.bottom > profileBottom) profileBottom = row.bottom
    if (paneY < row.top - tolerancePx || paneY > row.bottom + tolerancePx) continue
    const barRight = row.left + row.totalWidth
    if (paneX >= row.left - tolerancePx && paneX <= barRight + tolerancePx) {
      return true
    }
  }

  for (const line of model.lines) {
    if (Math.abs(paneY - line.y) > tolerancePx) continue
    if (paneX >= line.x1 - tolerancePx && paneX <= line.x2 + tolerancePx) {
      return true
    }
  }

  // The profile rectangle: any point over the profile's time span and price
  // extent selects it, no matter which level groups render as lines or steps.
  if (
    Number.isFinite(profileTop) &&
    Number.isFinite(profileBottom) &&
    paneY >= profileTop - tolerancePx &&
    paneY <= profileBottom + tolerancePx
  ) {
    return true
  }

  return false
}

function hitTestSingleFixedRangeVolumeProfile(
  instanceId: string,
  instanceIndex: number,
  model: FixedRangeVolumeProfileInstanceDrawModel,
  paneX: number,
  paneY: number,
  radiusSq: number,
  bodyTolerancePx: number,
  allowEndpointHandles: boolean,
): FixedRangeVolumeProfileHitTarget | null {
  if (allowEndpointHandles && model.endpointHandles) {
    const { startX, endX, y } = model.endpointHandles
    if (hitEndpoint(paneX, paneY, startX, y, radiusSq)) {
      return { instanceId, kind: 'start', priority: ENDPOINT_PRIORITY, instanceIndex }
    }
    if (hitEndpoint(paneX, paneY, endX, y, radiusSq)) {
      return { instanceId, kind: 'end', priority: ENDPOINT_PRIORITY, instanceIndex }
    }
  }

  if (hitTestFixedRangeVolumeProfileBody(model, paneX, paneY, bodyTolerancePx)) {
    return { instanceId, kind: 'body', priority: BODY_PRIORITY, instanceIndex }
  }

  return null
}

export function isFixedRangeVolumeProfileEndpointHandle(
  kind: FixedRangeVolumeProfileHandleKind,
): boolean {
  return kind === 'start' || kind === 'end'
}

export function isFixedRangeVolumeProfileInstanceLocked(
  instance: FixedRangeVolumeProfileInstance,
): boolean {
  return instance.locked === true
}

export function hitTestFixedRangeVolumeProfiles(
  instances: readonly FixedRangeVolumeProfileInstance[],
  models: readonly FixedRangeVolumeProfileInstanceDrawModel[],
  selectedId: string | null,
  paneX: number,
  paneY: number,
  bodyTolerancePx: number = 4,
  endpointHitRadiusPx: number = FRVP_ENDPOINT_HANDLE_HIT_RADIUS_PX,
): FixedRangeVolumeProfileHitTarget | null {
  if (!Number.isFinite(paneX) || !Number.isFinite(paneY)) return null
  const radiusSq = endpointHitRadiusPx * endpointHitRadiusPx
  let best: FixedRangeVolumeProfileHitTarget | null = null

  for (let index = models.length - 1; index >= 0; index -= 1) {
    const model = models[index]
    const instance = instances.find((item) => item.id === model.instanceId)
    if (!instance || isFixedRangeVolumeProfileInstanceHidden(instance)) continue
    const allowHandles =
      selectedId === instance.id && !isFixedRangeVolumeProfileInstanceLocked(instance)
    const hit = hitTestSingleFixedRangeVolumeProfile(
      model.instanceId,
      index,
      model,
      paneX,
      paneY,
      radiusSq,
      bodyTolerancePx,
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
