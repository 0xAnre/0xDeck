/**
 * Render mode for the two fixed-range volume profile level groups:
 * the value area (`VAH` + `VAL`) and the `POC`.
 *
 * - `line` — today's single flat full-range level line (the default)
 * - `step` — the developing (cumulative) level as a step/staircase series only
 * - `both` — the flat full-range line *and* the developing step series
 *
 * Stored per instance inside `0xdeck-widget-fixed-range-vp-instances`. A record
 * without the field is a legacy instance and resolves to `line`, so saved
 * profiles keep their exact previous appearance. The modes replay the existing
 * per-level stroke settings (color/opacity/width/`Line`-`Dot`); there is no
 * second colour model for the developing series.
 */
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

export const FRVP_LEVEL_RENDER_MODES = ['line', 'step', 'both'] as const

export type FrvpLevelRenderMode = (typeof FRVP_LEVEL_RENDER_MODES)[number]

/** Missing/invalid stored values resolve to this mode (today's rendering). */
export const DEFAULT_FRVP_LEVEL_RENDER_MODE: FrvpLevelRenderMode = 'line'

/** Dialog labels; the storage vocabulary stays `line` / `step` / `both`. */
export const FRVP_LEVEL_RENDER_MODE_LABELS: Record<FrvpLevelRenderMode, string> = {
  line: 'Line',
  step: 'Step',
  both: 'Both',
}

export function isFrvpLevelRenderMode(value: unknown): value is FrvpLevelRenderMode {
  return (
    typeof value === 'string' &&
    (FRVP_LEVEL_RENDER_MODES as readonly string[]).includes(value)
  )
}

/** `undefined` for absent/invalid input, so sanitizers fall back to the default. */
export function sanitizeFrvpLevelRenderMode(value: unknown): FrvpLevelRenderMode | undefined {
  return isFrvpLevelRenderMode(value) ? value : undefined
}

export function frvpInstanceValueAreaMode(
  instance: Pick<FixedRangeVolumeProfileInstance, 'valueAreaMode'>,
): FrvpLevelRenderMode {
  return sanitizeFrvpLevelRenderMode(instance.valueAreaMode) ?? DEFAULT_FRVP_LEVEL_RENDER_MODE
}

export function frvpInstancePocMode(
  instance: Pick<FixedRangeVolumeProfileInstance, 'pocMode'>,
): FrvpLevelRenderMode {
  return sanitizeFrvpLevelRenderMode(instance.pocMode) ?? DEFAULT_FRVP_LEVEL_RENDER_MODE
}

/** True when the group draws the developing step series. */
export function frvpRenderModeShowsStep(mode: FrvpLevelRenderMode): boolean {
  return mode === 'step' || mode === 'both'
}

/** True when the group draws the flat full-range line. */
export function frvpRenderModeShowsLine(mode: FrvpLevelRenderMode): boolean {
  return mode === 'line' || mode === 'both'
}

export function setFrvpInstanceValueAreaMode(
  instance: FixedRangeVolumeProfileInstance,
  mode: FrvpLevelRenderMode,
): FixedRangeVolumeProfileInstance {
  if (!isFrvpLevelRenderMode(mode)) return instance
  if (mode === DEFAULT_FRVP_LEVEL_RENDER_MODE) {
    const next = { ...instance }
    delete next.valueAreaMode
    return next
  }
  return { ...instance, valueAreaMode: mode }
}

export function setFrvpInstancePocMode(
  instance: FixedRangeVolumeProfileInstance,
  mode: FrvpLevelRenderMode,
): FixedRangeVolumeProfileInstance {
  if (!isFrvpLevelRenderMode(mode)) return instance
  if (mode === DEFAULT_FRVP_LEVEL_RENDER_MODE) {
    const next = { ...instance }
    delete next.pocMode
    return next
  }
  return { ...instance, pocMode: mode }
}
