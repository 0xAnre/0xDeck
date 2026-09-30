import type { IChartApi, Logical, MouseEventParams, Time } from 'lightweight-charts'
import {
  isValidUnixChartTimeSeconds,
} from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'

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

export function resolveChartTimeFromCoordinate(
  chart: IChartApi,
  x: number,
): number | null {
  if (!Number.isFinite(x)) return null
  const time = chart.timeScale().coordinateToTime(x)
  return resolveChartEventTime(time === null ? undefined : time)
}

export function resolveFixedRangeVolumeProfileCrosshairTime(
  chart: IChartApi,
  param: MouseEventParams<Time>,
): number | null {
  if (!param.point) return null
  const fromEvent = resolveChartEventTime(param.time)
  if (fromEvent !== null) return fromEvent
  return resolveChartTimeFromCoordinate(chart, param.point.x)
}

export function resolveFixedRangeVolumeProfileClickTime(
  chart: IChartApi,
  param: MouseEventParams<Time>,
  interaction: FixedRangeVolumeProfileInteractionState,
): number | null {
  if (!param.point) return null

  const fromEvent = resolveChartEventTime(param.time)
  if (fromEvent !== null) return fromEvent

  const fromCoordinate = resolveChartTimeFromCoordinate(chart, param.point.x)
  if (fromCoordinate !== null) return fromCoordinate

  if (param.logical !== undefined) {
    const logical = Number(param.logical)
    if (Number.isFinite(logical)) {
      const x = chart.timeScale().logicalToCoordinate(logical as Logical)
      if (x !== null) {
        const fromLogical = resolveChartTimeFromCoordinate(chart, x)
        if (fromLogical !== null) return fromLogical
      }
    }
  }

  if (interaction.phase === 'preview' && interaction.draft !== null) {
    const previewTime = interaction.draft.previewTime
    if (isValidUnixChartTimeSeconds(previewTime)) return previewTime
  }

  return null
}
