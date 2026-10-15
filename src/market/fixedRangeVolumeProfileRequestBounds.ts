import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import {
  normalizeFixedRangeVolumeProfileTimes,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'

export type FixedRangeVolumeProfileRequestBounds = {
  requestStartTime: number
  requestEndTime: number
}

export type FixedRangeVolumeProfileComputationBounds = {
  fromTime: number
  toTime: number
}

/**
 * Effective right boundary of the volume calculation.
 *
 * With Extend Right enabled the calculation ignores the drawing's `toTime` in
 * favour of the latest available candle (`liveRightEdge`). `toTime` is only
 * used as a lower bound so a stale/short live edge (for example right after an
 * interval switch or an empty dataset) can never shrink a valid drawing range.
 * Everything else keeps the exact original fixed-range behaviour.
 */
export function resolveFixedRangeVolumeProfileEffectiveToTime(
  instance: Pick<FixedRangeVolumeProfileInstance, 'toTime' | 'extendRight'>,
  liveRightEdge: number | null,
): number {
  if (instance.extendRight !== true) return instance.toTime
  if (liveRightEdge === null || !Number.isFinite(liveRightEdge)) return instance.toTime
  const edge = Math.trunc(liveRightEdge)
  if (!Number.isFinite(edge) || edge <= 0) return instance.toTime
  return Math.max(instance.toTime, edge)
}

export function computeFixedRangeVolumeProfileRequestBounds(
  instance: Pick<
    FixedRangeVolumeProfileInstance,
    'fromTime' | 'toTime' | 'selectionInterval' | 'extendRight'
  >,
  liveRightEdge: number | null = null,
): FixedRangeVolumeProfileRequestBounds | null {
  const normalized = normalizeFixedRangeVolumeProfileTimes(instance.fromTime, instance.toTime)
  if (!normalized) return null

  const duration = candleIntervalDurationSeconds(instance.selectionInterval)
  if (!Number.isFinite(duration) || duration <= 0) return null

  const effectiveToTime = resolveFixedRangeVolumeProfileEffectiveToTime(
    { toTime: normalized.toTime, extendRight: instance.extendRight },
    liveRightEdge,
  )

  const requestStartTime = normalized.fromTime
  const requestEndTime = effectiveToTime + duration
  if (!Number.isSafeInteger(requestEndTime)) return null
  if (requestStartTime >= requestEndTime) return null

  return { requestStartTime, requestEndTime }
}

export function computeFixedRangeVolumeProfileComputationBounds(
  request: FixedRangeVolumeProfileRequestBounds,
): FixedRangeVolumeProfileComputationBounds | null {
  const { requestStartTime, requestEndTime } = request
  if (!Number.isSafeInteger(requestStartTime) || !Number.isSafeInteger(requestEndTime)) {
    return null
  }
  if (requestStartTime >= requestEndTime) return null

  const toTime = requestEndTime - 1
  if (!Number.isSafeInteger(toTime) || toTime < requestStartTime) return null

  return { fromTime: requestStartTime, toTime }
}
