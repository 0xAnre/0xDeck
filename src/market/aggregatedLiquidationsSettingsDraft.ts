/**
 * Draft / diff logic for `AggregatedLiquidationsSettingsDialog`.
 *
 * Same draft + Save contract as the other chart settings dialogs: the dialog
 * edits a local copy, `Save` commits the changed fields through the existing
 * settings callback, and `Cancel` / `X` / `Esc` / outside click discard it
 * without touching storage. Pure functions only.
 */
import {
  DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
  isAggregatedLiquidationsPosition,
  type AggregatedLiquidationsPosition,
  type AggregatedLiquidationsSettings,
  type AggregatedLiquidationsSource,
} from './aggregatedLiquidationsSettings.ts'

export type AggregatedLiquidationsSettingsDraft = {
  source: AggregatedLiquidationsSource
  position: AggregatedLiquidationsPosition
}

export type AggregatedLiquidationsSettingsDraftPatch = {
  source?: AggregatedLiquidationsSource
  position?: AggregatedLiquidationsPosition
}

export function aggregatedLiquidationsSettingsDraftFrom(
  settings: AggregatedLiquidationsSettings,
): AggregatedLiquidationsSettingsDraft {
  return { source: settings.source, position: settings.position }
}

/** V1 only ships the Binance source; anything else falls back to the default. */
export function sanitizeAggregatedLiquidationsSettingsDraft(
  initial: AggregatedLiquidationsSettingsDraft,
  draft: AggregatedLiquidationsSettingsDraft,
): AggregatedLiquidationsSettingsDraft {
  return {
    source: draft.source === 'binance' ? draft.source : initial.source,
    position: isAggregatedLiquidationsPosition(draft.position)
      ? draft.position
      : DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS.position,
  }
}

export function aggregatedLiquidationsSettingsDraftPatch(
  initial: AggregatedLiquidationsSettingsDraft,
  draft: AggregatedLiquidationsSettingsDraft,
): AggregatedLiquidationsSettingsDraftPatch {
  const patch: AggregatedLiquidationsSettingsDraftPatch = {}
  if (draft.source !== initial.source) patch.source = draft.source
  if (draft.position !== initial.position) patch.position = draft.position
  return patch
}

export function isAggregatedLiquidationsSettingsDraftPatchEmpty(
  patch: AggregatedLiquidationsSettingsDraftPatch,
): boolean {
  return Object.keys(patch).length === 0
}
