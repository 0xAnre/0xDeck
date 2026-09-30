import type { Time } from 'lightweight-charts'

export function resolveChartEventTime(time: Time | undefined): number | null {
  if (time === undefined) return null
  if (typeof time === 'number' && Number.isFinite(time)) {
    return Math.trunc(time)
  }
  if (typeof time === 'object' && time !== null && 'year' in time) {
    const { year, month, day } = time
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null
    }
    return Math.trunc(Date.UTC(year, month - 1, day) / 1000)
  }
  return null
}
