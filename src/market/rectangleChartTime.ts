import type { IChartApi, Logical, Time, UTCTimestamp } from 'lightweight-charts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export function resolveRectangleTimeToCoordinate(
  chart: IChartApi,
  time: number,
): number | null {
  if (!Number.isFinite(time) || !isValidUnixChartTimeSeconds(Math.trunc(time))) {
    return null
  }
  const unixTime = Math.trunc(time) as UTCTimestamp
  const timeScale = chart.timeScale()
  const direct = timeScale.timeToCoordinate(unixTime)
  if (direct !== null) return direct

  const index = timeScale.timeToIndex(unixTime as Time, true)
  if (index === null) return null
  return timeScale.logicalToCoordinate(index as unknown as Logical)
}
