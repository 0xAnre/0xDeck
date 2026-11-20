import {
  MARKET_SEMANTIC_NEGATIVE_COLOR,
  MARKET_SEMANTIC_POSITIVE_COLOR,
} from './marketSemanticColors.ts'
import type { MarketExchange } from './types.ts'

/** User requirement: fixed account-marker colors in every theme (light and dark). */
export const POSITION_MARKER_BUY_COLOR = MARKET_SEMANTIC_POSITIVE_COLOR
export const POSITION_MARKER_SELL_COLOR = MARKET_SEMANTIC_NEGATIVE_COLOR

/**
 * Marker size is a presentation preference only: `SeriesMarker.size` is a
 * multiple of the lightweight-charts default arrow. Range, step and default
 * live here so the sanitizer, the settings slider and the marker mapping cannot
 * drift apart.
 */
export const POSITION_MARKER_SIZE_MIN = 0.5
export const POSITION_MARKER_SIZE_MAX = 3
export const POSITION_MARKER_SIZE_STEP = 0.25
export const POSITION_MARKER_SIZE_DEFAULT = 1

/** Per-widget Position Markers state: visibility plus the presentation-only size. */
export type PositionMarkerSettings = {
  enabled: boolean
  size: number
}

export const DEFAULT_POSITION_MARKER_SETTINGS: PositionMarkerSettings = {
  enabled: false,
  size: POSITION_MARKER_SIZE_DEFAULT,
}

/**
 * Clamp to the supported range and round to the slider step. Anything that is
 * not a finite number (missing, `null`, a string, `NaN`) falls back to the
 * default, so a hand-edited record can never render an invalid arrow.
 */
export function sanitizePositionMarkerSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return POSITION_MARKER_SIZE_DEFAULT
  }
  const clamped = Math.min(
    POSITION_MARKER_SIZE_MAX,
    Math.max(POSITION_MARKER_SIZE_MIN, value),
  )
  // Both bounds are exact step multiples, so stepping a clamped value cannot
  // leave the range and the result needs no second clamp.
  return Math.round(clamped / POSITION_MARKER_SIZE_STEP) * POSITION_MARKER_SIZE_STEP
}

/** Slider readout, e.g. `0.5×`, `1×`, `1.25×`, `3×`. */
export function positionMarkerSizeLabel(size: unknown): string {
  return `${sanitizePositionMarkerSize(size).toFixed(2).replace(/\.?0+$/, '')}×`
}

/**
 * Panel-scoped DOM ids for the settings dialog's `Marker Size` label and its
 * slider. Deriving them from the panel (not from a literal) is what keeps two
 * chart panels, or a cloned widget, from sharing one `id`/`htmlFor`/
 * `aria-labelledby` triple across two dialogs.
 */
export function positionMarkerSizeFieldIds(panelId: string): {
  labelId: string
  sliderId: string
} {
  const sliderId = `${panelId}-position-marker-size`
  return { labelId: `${sliderId}-label`, sliderId }
}

/**
 * Storage contract for `0xdeck-widget-market-position-markers`. The legacy
 * record was a bare boolean (the toggle only): it migrates to the default size.
 * Anything unreadable falls back to OFF at the default size instead of failing
 * the whole record.
 */
export function sanitizePositionMarkerSettings(value: unknown): PositionMarkerSettings {
  if (typeof value === 'boolean') {
    return { enabled: value, size: POSITION_MARKER_SIZE_DEFAULT }
  }
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_POSITION_MARKER_SETTINGS }
  }
  const record = value as Record<string, unknown>
  return {
    enabled: record.enabled === true,
    size: sanitizePositionMarkerSize(record.size),
  }
}

/** Position Markers is a Hyperliquid-only item in the Indicators menu. */
export function isPositionMarkersMenuVisible(exchange: MarketExchange): boolean {
  return exchange === 'hyperliquid'
}

/** Account fills are loaded and markers rendered only when ON + Hyperliquid. */
export function shouldShowPositionMarkers(
  exchange: MarketExchange,
  enabled: boolean,
): boolean {
  return enabled && isPositionMarkersMenuVisible(exchange)
}
