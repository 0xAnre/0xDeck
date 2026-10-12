import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeFromCoordinate,
  type RectangleChartTimeContext,
} from './rectangleChartTime.ts'

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

export function buildFixedRangeVolumeProfileChartTimeContext(
  chart: IChartApi,
  lastBarUnixTime: number | null,
  intervalDurationSeconds: number,
): RectangleChartTimeContext {
  return buildRectangleChartTimeContext(chart, lastBarUnixTime, intervalDurationSeconds)
}

export function clampFixedRangeVolumeProfileSelectionTime(
  time: number,
  context: RectangleChartTimeContext | null,
): number | null {
  if (!isValidUnixChartTimeSeconds(time)) return null
  const last = context?.lastBarUnixTime
  if (last !== null && last !== undefined && time > last) {
    return last
  }
  return time
}

export function resolveChartTimeFromCoordinate(
  chart: IChartApi,
  x: number,
  context: RectangleChartTimeContext | null = null,
): number | null {
  if (!Number.isFinite(x)) return null
  const direct = resolveChartEventTime(chart.timeScale().coordinateToTime(x) ?? undefined)
  if (direct !== null) {
    return clampFixedRangeVolumeProfileSelectionTime(direct, context)
  }
  if (!context) return null
  const fromLogical = resolveRectangleTimeFromCoordinate(chart, x, context)
  if (fromLogical === null) return null
  return clampFixedRangeVolumeProfileSelectionTime(fromLogical, context)
}

export function resolveFixedRangeVolumeProfileCrosshairTime(
  chart: IChartApi,
  param: MouseEventParams<Time>,
  context: RectangleChartTimeContext | null = null,
): number | null {
  if (!param.point) return null
  const fromEvent = resolveChartEventTime(param.time)
  if (fromEvent !== null) {
    return clampFixedRangeVolumeProfileSelectionTime(fromEvent, context)
  }
  return resolveChartTimeFromCoordinate(chart, param.point.x, context)
}
