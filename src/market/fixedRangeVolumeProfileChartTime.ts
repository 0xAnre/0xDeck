import type { Time } from 'lightweight-charts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export function resolveChartEventTime(time: Time | undefined): number | null {
  if (time === undefined) return null
  if (typeof time === 'number' && Number.isFinite(time)) {
    const seconds = Math.trunc(time)
    return isValidUnixChartTimeSeconds(seconds) ? seconds : null
  }
  if (typeof time === 'object' && time !== null && 'year' in time) {
    const { year, month, day } = time
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null
    }
    const seconds = Math.trunc(Date.UTC(year, month - 1, day) / 1000)
    return isValidUnixChartTimeSeconds(seconds) ? seconds : null
  }
  return null
}
