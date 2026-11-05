/**
 * Update interval (stride) of the fixed-range volume profile's developing
 * value area and POC series.
 *
 * `1` is today's behaviour and the default: the cumulative value area and POC
 * are recomputed on every bar. A larger interval recomputes them only on every
 * Nth bar, so the value holds for those N bars and the developing staircase
 * shows the profile's development at that stride instead of every per-bar
 * wobble. The per-bar sample list is unchanged (one sample per bar, the held
 * value between updates) and the last bar is always recomputed exactly, so the
 * final sample still equals the full-range value.
 *
 * Stored per instance inside `0xdeck-widget-fixed-range-vp-instances`; absent or
 * invalid values resolve to `1` and are not written back.
 */
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

export const FRVP_DEVELOPING_UPDATE_BARS = [1, 3, 5, 10, 30, 60] as const

export type FrvpDevelopingUpdateBars = (typeof FRVP_DEVELOPING_UPDATE_BARS)[number]

/** Every bar (today's developing behaviour). */
export const DEFAULT_FRVP_DEVELOPING_UPDATE_BARS: FrvpDevelopingUpdateBars = 1

export function isFrvpDevelopingUpdateBars(value: unknown): value is FrvpDevelopingUpdateBars {
  return (
    typeof value === 'number' &&
    (FRVP_DEVELOPING_UPDATE_BARS as readonly number[]).includes(value)
  )
}

/** `undefined` for absent/invalid input, so the instance resolver falls back to the default. */
export function sanitizeFrvpDevelopingUpdateBars(
  value: unknown,
): FrvpDevelopingUpdateBars | undefined {
  return isFrvpDevelopingUpdateBars(value) ? value : undefined
}

export function frvpInstanceDevelopingUpdateBars(
  instance: Pick<FixedRangeVolumeProfileInstance, 'developingUpdateBars'>,
): FrvpDevelopingUpdateBars {
  return (
    sanitizeFrvpDevelopingUpdateBars(instance.developingUpdateBars) ??
    DEFAULT_FRVP_DEVELOPING_UPDATE_BARS
  )
}

/** Dialog label: the value is the number of bars between two recomputations. */
export function frvpDevelopingUpdateBarsLabel(bars: FrvpDevelopingUpdateBars): string {
  return bars === DEFAULT_FRVP_DEVELOPING_UPDATE_BARS ? 'Every bar (default)' : `Every ${bars} bars`
}

export function setFrvpInstanceDevelopingUpdateBars(
  instance: FixedRangeVolumeProfileInstance,
  bars: FrvpDevelopingUpdateBars,
): FixedRangeVolumeProfileInstance {
  if (!isFrvpDevelopingUpdateBars(bars)) return instance
  if (bars === DEFAULT_FRVP_DEVELOPING_UPDATE_BARS) {
    const next = { ...instance }
    delete next.developingUpdateBars
    return next
  }
  return { ...instance, developingUpdateBars: bars }
}
