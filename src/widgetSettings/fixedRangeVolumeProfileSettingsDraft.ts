/**
 * Draft / diff logic for `FixedRangeVolumeProfileSettingsDialog`.
 *
 * The dialog edits a local draft of the volume-profile numbers and styles and
 * commits only changed fields on `Save`; `Cancel` / `X` / `Esc` / outside click
 * drop the draft without writing storage or mutating the instance.
 *
 * Drafts hold raw typed numbers so a partially typed value is not clamped per
 * keystroke; `sanitizeFrvpSettingsDraft` clamps on blur / Save. Pure functions.
 */
import {
  isLineChartHexColor,
  isLineChartStrokeWidth,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '../market/lineChartStroke.ts'
import { isMarketStyleOpacityPercent } from '../market/marketStylePalette.ts'
import {
  MAX_FIXED_RANGE_VP_ROW_COUNT,
  type FixedRangeVolumeProfileInstance,
} from '../market/fixedRangeVolumeProfileInstances.ts'
import {
  frvpInstanceLevelLineStyle,
  frvpInstanceLevelLineWidth,
  frvpInstanceLevelStrokeOpacityPercent,
  frvpLevelStrokeColorInputValue,
  type FrvpLevelLineKind,
} from '../market/frvpInstanceLineStyles.ts'
import {
  frvpHistogramColorInputValue,
  frvpHistogramOpacityPercent,
  type FrvpHistogramDirection,
} from '../market/frvpHistogramStyles.ts'

export const FRVP_LEVEL_LINE_KINDS = ['poc', 'vah', 'val'] as const

export const FRVP_HISTOGRAM_DIRECTIONS = ['up', 'down'] as const

export type FrvpLevelStyleDraft = {
  color: string
  opacityPercent: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
}

export type FrvpHistogramStyleDraft = {
  color: string
  opacityPercent: number
}

export type FrvpSettingsDraft = {
  rowCount: number
  valueAreaPercent: number
  extendRight: boolean
  histogram: Record<FrvpHistogramDirection, FrvpHistogramStyleDraft>
  levels: Record<FrvpLevelLineKind, FrvpLevelStyleDraft>
}

export type FrvpLevelStylePatch = {
  kind: FrvpLevelLineKind
  strokeColor?: string
  opacityPercent?: number
  lineWidth?: LineChartStrokeWidth
  lineStyle?: LineChartStrokeStyle
}

export type FrvpHistogramStylePatch = {
  direction: FrvpHistogramDirection
  color?: string
  opacityPercent?: number
}

/** Only changed fields; empty arrays/absent keys must not be applied. */
export type FrvpSettingsDraftPatch = {
  rowCount?: number
  valueAreaPercent?: number
  extendRight?: boolean
  histogram: FrvpHistogramStylePatch[]
  levels: FrvpLevelStylePatch[]
}

function emptyLevelDraft(): FrvpLevelStyleDraft {
  return { color: '', opacityPercent: 0, lineWidth: 1, lineStyle: 'solid' }
}

export function frvpSettingsDraftFromInstance(
  instance: FixedRangeVolumeProfileInstance,
): FrvpSettingsDraft {
  const levels = {} as Record<FrvpLevelLineKind, FrvpLevelStyleDraft>
  for (const kind of FRVP_LEVEL_LINE_KINDS) {
    levels[kind] = {
      color: frvpLevelStrokeColorInputValue(instance, kind),
      opacityPercent: frvpInstanceLevelStrokeOpacityPercent(instance, kind),
      lineWidth: frvpInstanceLevelLineWidth(instance, kind),
      lineStyle: frvpInstanceLevelLineStyle(instance, kind),
    }
  }
  const histogram = {} as Record<FrvpHistogramDirection, FrvpHistogramStyleDraft>
  for (const direction of FRVP_HISTOGRAM_DIRECTIONS) {
    histogram[direction] = {
      color: frvpHistogramColorInputValue(instance, direction),
      opacityPercent: frvpHistogramOpacityPercent(instance, direction),
    }
  }
  return {
    rowCount: instance.rowCount,
    valueAreaPercent: instance.valueAreaPercent,
    extendRight: instance.extendRight === true,
    histogram,
    levels,
  }
}

function sanitizeRowCountDraft(rowCount: number, fallback: number): number {
  if (!Number.isFinite(rowCount)) return fallback
  const rounded = Math.round(rowCount)
  if (rounded < 1) return fallback
  return Math.min(rounded, MAX_FIXED_RANGE_VP_ROW_COUNT)
}

function sanitizeValueAreaPercentDraft(valueAreaPercent: number, fallback: number): number {
  if (!Number.isFinite(valueAreaPercent)) return fallback
  const clamped = Math.min(Math.max(valueAreaPercent, 0), 100)
  return Math.round(clamped * 100) / 100
}

function sanitizeLevelStyleDraft(
  initial: FrvpLevelStyleDraft,
  draft: FrvpLevelStyleDraft,
): FrvpLevelStyleDraft {
  return {
    color: isLineChartHexColor(draft.color) ? draft.color : initial.color,
    opacityPercent: isMarketStyleOpacityPercent(draft.opacityPercent)
      ? draft.opacityPercent
      : initial.opacityPercent,
    lineWidth: isLineChartStrokeWidth(draft.lineWidth) ? draft.lineWidth : initial.lineWidth,
    lineStyle: sanitizeLineChartStrokeStyle(draft.lineStyle) ?? initial.lineStyle,
  }
}

/** Clamp typed numbers and coerce styles; invalid fields fall back to `initial`. */
export function sanitizeFrvpSettingsDraft(
  initial: FrvpSettingsDraft,
  draft: FrvpSettingsDraft,
): FrvpSettingsDraft {
  const levels = {} as Record<FrvpLevelLineKind, FrvpLevelStyleDraft>
  for (const kind of FRVP_LEVEL_LINE_KINDS) {
    levels[kind] = sanitizeLevelStyleDraft(initial.levels[kind], draft.levels[kind])
  }
  const histogram = {} as Record<FrvpHistogramDirection, FrvpHistogramStyleDraft>
  for (const direction of FRVP_HISTOGRAM_DIRECTIONS) {
    const levelDraft = draft.histogram[direction]
    const initialDraft = initial.histogram[direction]
    histogram[direction] = {
      color: isLineChartHexColor(levelDraft.color) ? levelDraft.color : initialDraft.color,
      opacityPercent: isMarketStyleOpacityPercent(levelDraft.opacityPercent)
        ? levelDraft.opacityPercent
        : initialDraft.opacityPercent,
    }
  }
  return {
    rowCount: sanitizeRowCountDraft(draft.rowCount, initial.rowCount),
    valueAreaPercent: sanitizeValueAreaPercentDraft(
      draft.valueAreaPercent,
      initial.valueAreaPercent,
    ),
    extendRight: draft.extendRight === true,
    histogram,
    levels,
  }
}

/** Changed fields only. */
export function frvpSettingsDraftPatch(
  initial: FrvpSettingsDraft,
  draft: FrvpSettingsDraft,
): FrvpSettingsDraftPatch {
  const levels: FrvpLevelStylePatch[] = []
  for (const kind of FRVP_LEVEL_LINE_KINDS) {
    const before = initial.levels[kind] ?? emptyLevelDraft()
    const after = draft.levels[kind]
    const patch: FrvpLevelStylePatch = { kind }
    if (after.color !== before.color) patch.strokeColor = after.color
    if (after.opacityPercent !== before.opacityPercent) {
      patch.opacityPercent = after.opacityPercent
    }
    if (after.lineWidth !== before.lineWidth) patch.lineWidth = after.lineWidth
    if (after.lineStyle !== before.lineStyle) patch.lineStyle = after.lineStyle
    if (Object.keys(patch).length > 1) levels.push(patch)
  }

  const histogram: FrvpHistogramStylePatch[] = []
  for (const direction of FRVP_HISTOGRAM_DIRECTIONS) {
    const before = initial.histogram[direction]
    const after = draft.histogram[direction]
    const patch: FrvpHistogramStylePatch = { direction }
    if (after.color !== before.color) patch.color = after.color
    if (after.opacityPercent !== before.opacityPercent) {
      patch.opacityPercent = after.opacityPercent
    }
    if (Object.keys(patch).length > 1) histogram.push(patch)
  }

  const patch: FrvpSettingsDraftPatch = { histogram, levels }
  if (draft.rowCount !== initial.rowCount) patch.rowCount = draft.rowCount
  if (draft.valueAreaPercent !== initial.valueAreaPercent) {
    patch.valueAreaPercent = draft.valueAreaPercent
  }
  if (draft.extendRight !== initial.extendRight) patch.extendRight = draft.extendRight
  return patch
}

export function isFrvpSettingsDraftPatchEmpty(patch: FrvpSettingsDraftPatch): boolean {
  return (
    patch.rowCount === undefined &&
    patch.valueAreaPercent === undefined &&
    patch.extendRight === undefined &&
    patch.histogram.length === 0 &&
    patch.levels.length === 0
  )
}
