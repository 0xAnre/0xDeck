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

export function computeFixedRangeVolumeProfileRequestBounds(
  instance: Pick<FixedRangeVolumeProfileInstance, 'fromTime' | 'toTime' | 'selectionInterval'>,
): FixedRangeVolumeProfileRequestBounds | null {
  const normalized = normalizeFixedRangeVolumeProfileTimes(instance.fromTime, instance.toTime)
  if (!normalized) return null

  const duration = candleIntervalDurationSeconds(instance.selectionInterval)
  if (!Number.isFinite(duration) || duration <= 0) return null

  const requestStartTime = normalized.fromTime
  const requestEndTime = normalized.toTime + duration
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
