import type { IChartApi, Logical, Time, UTCTimestamp } from 'lightweight-charts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type RectangleTimeEdge = 'start' | 'end'

/**
 * `timeToIndex(..., true)` returns the first bar at or after `time`, or the
 * last bar when `time` is past the series. It is not a nearest-bar search.
 */
function projectedLogicalIndex(
  ceilIndex: number,
  barTime: number | null,
  unixTime: number,
  edge: RectangleTimeEdge,
): number {
  if (barTime === null) return ceilIndex
  switch (edge) {
    case 'start':
      return barTime > unixTime ? ceilIndex - 1 : ceilIndex
    case 'end':
      return barTime < unixTime ? ceilIndex + 1 : ceilIndex
    default: {
      const unreachable: never = edge
      return unreachable
    }
  }
}

function snappedBarUnixTime(
  timeScale: ReturnType<IChartApi['timeScale']>,
  index: number,
): number | null {
  const coordinate = timeScale.logicalToCoordinate(index as Logical)
  if (coordinate === null) return null
  const barTime = timeScale.coordinateToTime(coordinate)
  if (typeof barTime !== 'number' || !Number.isFinite(barTime)) return null
  return barTime
}

export function resolveRectangleTimeToCoordinate(
  chart: IChartApi,
  time: number,
  edge: RectangleTimeEdge,
): number | null {
  if (!Number.isFinite(time) || !isValidUnixChartTimeSeconds(Math.trunc(time))) {
    return null
  }
  const unixTime = Math.trunc(time) as UTCTimestamp
  const timeScale = chart.timeScale()
  const direct = timeScale.timeToCoordinate(unixTime)
  if (direct !== null) return direct

  const ceilIndex = timeScale.timeToIndex(unixTime as Time, true)
  if (ceilIndex === null) return null
  const ceilIndexNumber = ceilIndex as number
  const barTime = snappedBarUnixTime(timeScale, ceilIndexNumber)
  // Index 0 with a later bar time means the timestamp is before the loaded
  // history, not in the gap ahead of the first candle.
  if (barTime !== null && ceilIndexNumber === 0 && barTime > unixTime) return null
  const logicalIndex = projectedLogicalIndex(
    ceilIndexNumber,
    barTime,
    unixTime,
    edge,
  )
  return timeScale.logicalToCoordinate(logicalIndex as Logical)
}
