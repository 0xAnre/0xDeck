/**
 * Draft / diff logic for `MarketIndicatorStyleDialog` (indicator color, opacity,
 * width, Line/Dot, the optional time-based VWAP band background and the RSI
 * period/level range).
 *
 * The dialog receives already-resolved input values (color/opacity/width/style
 * are resolved from the presentation plus the live series by the panel helpers),
 * keeps them in a local draft and commits only changed fields on `Save`.
 * `Cancel` / `X` / `Esc` / outside click drop the draft; RSI sanitizing on
 * blur/Enter only rewrites the draft, never storage. Pure functions only.
 */
import {
  isLineChartHexColor,
  isLineChartStrokeWidth,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '../market/lineChartStroke.ts'
import { isMarketStyleOpacityPercent } from '../market/marketStylePalette.ts'
import { sanitizeRsiSettings, type RsiSettings } from '../market/rsi.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'

/** Resolved values the dialog shows; `rsi` is `null` for non-RSI indicators. */
export type MarketIndicatorStyleDraft = {
  color: string
  opacityPercent: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
  /** Background fill of the time-based VWAP band; ignored by other indicators. */
  fillColor: string
  fillOpacityPercent: number
  rsi: RsiSettings | null
}

/** Only the changed presentation keys, plus the RSI settings when they changed. */
export type MarketIndicatorStyleDraftPatch = {
  presentation: MarketIndicatorPresentation
  rsi: RsiSettings | null
}

export function marketIndicatorStyleDraftFromInputs(inputs: {
  color: string
  opacityPercent: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
  fillColor: string
  fillOpacityPercent: number
  rsiSettings?: RsiSettings | null
}): MarketIndicatorStyleDraft {
  return {
    color: inputs.color,
    opacityPercent: inputs.opacityPercent,
    lineWidth: inputs.lineWidth,
    lineStyle: inputs.lineStyle,
    fillColor: inputs.fillColor,
    fillOpacityPercent: inputs.fillOpacityPercent,
    rsi: inputs.rsiSettings ? sanitizeRsiSettings(inputs.rsiSettings) : null,
  }
}

/** Coerce a draft to storable values; invalid fields fall back to `initial`. */
export function sanitizeMarketIndicatorStyleDraft(
  initial: MarketIndicatorStyleDraft,
  draft: MarketIndicatorStyleDraft,
): MarketIndicatorStyleDraft {
  return {
    color: isLineChartHexColor(draft.color) ? draft.color : initial.color,
    opacityPercent: isMarketStyleOpacityPercent(draft.opacityPercent)
      ? draft.opacityPercent
      : initial.opacityPercent,
    lineWidth: isLineChartStrokeWidth(draft.lineWidth) ? draft.lineWidth : initial.lineWidth,
    lineStyle: sanitizeLineChartStrokeStyle(draft.lineStyle) ?? initial.lineStyle,
    fillColor: isLineChartHexColor(draft.fillColor) ? draft.fillColor : initial.fillColor,
    fillOpacityPercent: isMarketStyleOpacityPercent(draft.fillOpacityPercent)
      ? draft.fillOpacityPercent
      : initial.fillOpacityPercent,
    rsi: draft.rsi === null
      ? null
      : sanitizeRsiSettings(draft.rsi),
  }
}

function rsiSettingsEqual(a: RsiSettings | null, b: RsiSettings | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.period === b.period &&
    a.overbought === b.overbought &&
    a.oversold === b.oversold &&
    a.thresholdGlow === b.thresholdGlow
  )
}

/**
 * Changed fields only. An unchanged presentation yields `{ presentation: {} }`
 * so the dialog can skip the callback instead of rewriting identical storage.
 */
export function marketIndicatorStyleDraftPatch(
  initial: MarketIndicatorStyleDraft,
  draft: MarketIndicatorStyleDraft,
): MarketIndicatorStyleDraftPatch {
  const presentation: MarketIndicatorPresentation = {}
  if (draft.color !== initial.color) presentation.color = draft.color
  if (draft.opacityPercent !== initial.opacityPercent) {
    presentation.opacity = draft.opacityPercent
  }
  if (draft.lineWidth !== initial.lineWidth) presentation.lineWidth = draft.lineWidth
  if (draft.lineStyle !== initial.lineStyle) presentation.lineStyle = draft.lineStyle
  if (draft.fillColor !== initial.fillColor) presentation.fillColor = draft.fillColor
  if (draft.fillOpacityPercent !== initial.fillOpacityPercent) {
    presentation.fillOpacity = draft.fillOpacityPercent
  }

  const rsiDraft = draft.rsi === null ? null : sanitizeRsiSettings(draft.rsi)
  const rsiInitial = initial.rsi === null ? null : sanitizeRsiSettings(initial.rsi)
  return {
    presentation,
    rsi: rsiSettingsEqual(rsiInitial, rsiDraft) ? null : rsiDraft,
  }
}

export function isMarketIndicatorStyleDraftPatchEmpty(
  patch: MarketIndicatorStyleDraftPatch,
): boolean {
  return Object.keys(patch.presentation).length === 0 && patch.rsi === null
}
