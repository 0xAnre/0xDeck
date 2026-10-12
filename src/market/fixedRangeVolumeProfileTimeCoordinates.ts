import type { IChartApi, Time, UTCTimestamp } from 'lightweight-charts'
import { buildFixedRangeVolumeProfileChartTimeContext } from './fixedRangeVolumeProfileChartTime.ts'
import { resolveRectangleTimeToCoordinate } from './rectangleChartTime.ts'

export function buildFixedRangeVolumeProfileTimeCoordinateResolvers(
  chart: IChartApi,
  lastBarUnixTime: number | null,
  intervalDurationSeconds: number,
): {
  fromTimeToCoordinate: (time: number) => number | null
  toTimeToCoordinate: (time: number) => number | null
} {
  const timeContext = buildFixedRangeVolumeProfileChartTimeContext(
    chart,
    lastBarUnixTime,
    intervalDurationSeconds,
  )
  const timeScale = chart.timeScale()
  const fromTimeToCoordinate = (time: number) =>
    resolveRectangleTimeToCoordinate(chart, time, 'start', timeContext) ??
    timeScale.timeToCoordinate(time as UTCTimestamp)
  const toTimeToCoordinate = (time: number) =>
    resolveRectangleTimeToCoordinate(chart, time, 'end', timeContext) ??
    timeScale.timeToCoordinate(time as Time)
  return { fromTimeToCoordinate, toTimeToCoordinate }
}
