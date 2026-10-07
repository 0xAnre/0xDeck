import type { IChartApi, Logical, Time, UTCTimestamp } from 'lightweight-charts'
import { resolveChartEventTime } from './fixedRangeVolumeProfileChartTime.ts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type RectangleTimeEdge = 'start' | 'end'

export type RectangleChartTimeContext = {
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
  lastBarLogicalIndex: number | null
}

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

function futureBarsAheadFromTimestamp(
  unixTime: number,
  lastBarUnixTime: number,
  intervalDurationSeconds: number,
  edge: RectangleTimeEdge,
): number {
  const ratio = (unixTime - lastBarUnixTime) / intervalDurationSeconds
  if (!Number.isFinite(ratio) || ratio <= 0) return 0
  switch (edge) {
    case 'start':
      return Math.floor(ratio)
    case 'end':
      return Math.ceil(ratio)
    default: {
      const unreachable: never = edge
      return unreachable
    }
  }
}

function logicalIndexForFutureTimestamp(
  unixTime: number,
  context: RectangleChartTimeContext,
  edge: RectangleTimeEdge,
): number | null {
  const { lastBarUnixTime, lastBarLogicalIndex, intervalDurationSeconds } = context
  if (
    lastBarUnixTime === null ||
    lastBarLogicalIndex === null ||
    !Number.isFinite(intervalDurationSeconds) ||
    intervalDurationSeconds <= 0
  ) {
    return null
  }
  if (unixTime <= lastBarUnixTime) return null
  const barsAhead = futureBarsAheadFromTimestamp(
    unixTime,
    lastBarUnixTime,
    intervalDurationSeconds,
    edge,
  )
  return lastBarLogicalIndex + barsAhead
}

/** Last loaded candle open time. O(1); does not copy series history. */
export function latestCandleUnixTime(candles: readonly { time: number }[]): number | null {
  const last = candles[candles.length - 1]
  if (!last || !Number.isFinite(last.time)) return null
  return last.time
}

export function buildRectangleChartTimeContext(
  chart: IChartApi,
  lastBarUnixTime: number | null,
  intervalDurationSeconds: number,
): RectangleChartTimeContext {
  if (
    !Number.isFinite(intervalDurationSeconds) ||
    intervalDurationSeconds <= 0 ||
    lastBarUnixTime === null ||
    !Number.isFinite(lastBarUnixTime)
  ) {
    return {
      intervalDurationSeconds,
      lastBarUnixTime: null,
      lastBarLogicalIndex: null,
    }
  }
  const resolvedLastBarUnixTime = resolveChartEventTime(Math.trunc(lastBarUnixTime) as UTCTimestamp)
  if (resolvedLastBarUnixTime === null) {
    return {
      intervalDurationSeconds,
      lastBarUnixTime: null,
      lastBarLogicalIndex: null,
    }
  }
  const lastBarLogicalIndex = chart.timeScale().timeToIndex(
    resolvedLastBarUnixTime as UTCTimestamp,
    true,
  )
  return {
    intervalDurationSeconds,
    lastBarUnixTime: resolvedLastBarUnixTime,
    lastBarLogicalIndex: lastBarLogicalIndex === null ? null : (lastBarLogicalIndex as number),
  }
}

export function resolveRectangleTimeFromCoordinate(
  chart: IChartApi,
  x: number,
  context: RectangleChartTimeContext | null,
): number | null {
  if (!Number.isFinite(x)) return null
  const timeScale = chart.timeScale()
  const direct = resolveChartEventTime(timeScale.coordinateToTime(x) ?? undefined)
  if (direct !== null) return direct

  if (!context) return null
  const logical = timeScale.coordinateToLogical(x)
  if (logical === null) return null
  const logicalIndex = logical as number
  const { lastBarLogicalIndex, lastBarUnixTime, intervalDurationSeconds } = context
  if (
    lastBarLogicalIndex === null ||
    lastBarUnixTime === null ||
    !Number.isFinite(intervalDurationSeconds) ||
    intervalDurationSeconds <= 0
  ) {
    return null
  }
  if (logicalIndex <= lastBarLogicalIndex) {
    const coordinate = timeScale.logicalToCoordinate(logical)
    if (coordinate === null) return null
    const fromLogical = resolveChartEventTime(timeScale.coordinateToTime(coordinate) ?? undefined)
    if (fromLogical !== null) return fromLogical
    return null
  }
  const barOffset = logicalIndex - lastBarLogicalIndex
  const unixTime = Math.trunc(lastBarUnixTime + barOffset * intervalDurationSeconds)
  return isValidUnixChartTimeSeconds(unixTime) ? unixTime : null
}

export function resolveRectangleTimeToCoordinate(
  chart: IChartApi,
  time: number,
  edge: RectangleTimeEdge,
  context: RectangleChartTimeContext | null = null,
): number | null {
  if (!Number.isFinite(time) || !isValidUnixChartTimeSeconds(Math.trunc(time))) {
    return null
  }
  const unixTime = Math.trunc(time) as UTCTimestamp
  const timeScale = chart.timeScale()
  const direct = timeScale.timeToCoordinate(unixTime)
  if (direct !== null) return direct

  const futureLogical = context
    ? logicalIndexForFutureTimestamp(unixTime, context, edge)
    : null
  if (futureLogical !== null) {
    return timeScale.logicalToCoordinate(futureLogical as Logical)
  }

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
