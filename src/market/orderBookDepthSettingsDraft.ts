/**
 * Draft / diff logic for the Order Book Depth settings fields inside
 * `MarketIndicatorStyleDialog`.
 *
 * Same draft + Save contract as every other chart settings dialog: the dialog
 * edits a local copy, `Save` commits only changed fields, and `Cancel` / `X` /
 * `Esc` / outside click discard it without touching storage. Pure functions
 * only.
 */
import {
  DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
  sanitizeOrderBookDepthSettings,
  type OrderBookDepthSettings,
} from './orderBookDepthSettings.ts'

export type OrderBookDepthSettingsDraft = OrderBookDepthSettings
export type OrderBookDepthSettingsDraftPatch = Partial<OrderBookDepthSettings>

export function orderBookDepthSettingsDraftFrom(
  settings: OrderBookDepthSettings,
): OrderBookDepthSettingsDraft {
  return {
    source: settings.source,
    distance: settings.distance,
    positiveThreshold: settings.positiveThreshold,
    negativeThreshold: settings.negativeThreshold,
  }
}

/** Coerce a draft to storable values. Invalid values fall back to defaults. */
export function sanitizeOrderBookDepthSettingsDraft(
  _initial: OrderBookDepthSettingsDraft,
  draft: OrderBookDepthSettingsDraft,
): OrderBookDepthSettingsDraft {
  return sanitizeOrderBookDepthSettings(draft)
}

export function orderBookDepthSettingsDraftPatch(
  initial: OrderBookDepthSettingsDraft,
  draft: OrderBookDepthSettingsDraft,
): OrderBookDepthSettingsDraftPatch {
  const sanitized = sanitizeOrderBookDepthSettings(draft)
  const patch: OrderBookDepthSettingsDraftPatch = {}
  if (sanitized.source !== initial.source) patch.source = sanitized.source
  if (sanitized.distance !== initial.distance) patch.distance = sanitized.distance
  if (sanitized.positiveThreshold !== initial.positiveThreshold) {
    patch.positiveThreshold = sanitized.positiveThreshold
  }
  if (sanitized.negativeThreshold !== initial.negativeThreshold) {
    patch.negativeThreshold = sanitized.negativeThreshold
  }
  return patch
}

export function isOrderBookDepthSettingsDraftPatchEmpty(
  patch: OrderBookDepthSettingsDraftPatch,
): boolean {
  return Object.keys(patch).length === 0
}

/** Re-exported so the dialog can name the defaults in its description. */
export { DEFAULT_ORDER_BOOK_DEPTH_SETTINGS }
