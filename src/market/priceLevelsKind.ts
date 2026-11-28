/**
 * The three live price-level profiles drawn on the BTC Perp candle pane.
 *
 * All three share one render/index/settings/interaction scaffold and differ
 * only by data source, label and semantics:
 *
 *  - `liquidation`  MarketLens L4 `liquidations`: open positions at their
 *                   liquidation price (signed position size = the position side,
 *                   green long / red short).
 *  - `stop-loss`    MarketLens L4 `tpsl` channel `stop_losses`: resting stop
 *                   orders at their trigger price, magnitude = the position size
 *                   they would close (the side is the *closing* order side).
 *  - `take-profit`  the same connection's `take_profits` channel.
 *
 * The profiles are independent indicators (own toggle, settings, storage and
 * feed channel) but one TPSL socket serves both trigger-order kinds.
 */
import type { MarketIndicatorId } from './indicators.ts'

export type PriceLevelKind = 'liquidation' | 'stop-loss' | 'take-profit'

export const PRICE_LEVEL_KINDS = [
  'liquidation',
  'stop-loss',
  'take-profit',
] as const satisfies readonly PriceLevelKind[]

/**
 * Fixed paint order: the liquidation profile is attached first (bottom), then
 * stop loss, then take profit. Hit testing uses the reverse order, so the
 * profile painted on top is also the one a pointer resolves first.
 */
export const PRICE_LEVEL_PAINT_ORDER: readonly PriceLevelKind[] = [
  'liquidation',
  'stop-loss',
  'take-profit',
]

/** Top-most profile first: the order the pointer resolves. */
export const PRICE_LEVEL_HIT_ORDER: readonly PriceLevelKind[] = [
  'take-profit',
  'stop-loss',
  'liquidation',
]

export const PRICE_LEVEL_KIND_INDICATOR: Record<PriceLevelKind, MarketIndicatorId> = {
  liquidation: 'liquidation-levels',
  'stop-loss': 'stop-loss-levels',
  'take-profit': 'take-profit-levels',
}

export const PRICE_LEVEL_KIND_LABEL: Record<PriceLevelKind, string> = {
  liquidation: 'Liquidation Levels',
  'stop-loss': 'Stop Loss Levels',
  'take-profit': 'Take Profit Levels',
}

/** Short on-chart label, e.g. `SL · LIVE 4s ago`. */
export const PRICE_LEVEL_KIND_SHORT_LABEL: Record<PriceLevelKind, string> = {
  liquidation: 'LEV LIQ',
  'stop-loss': 'SL',
  'take-profit': 'TP',
}

/** Slug used for DOM ids and settings storage keys. */
export const PRICE_LEVEL_KIND_SLUG: Record<PriceLevelKind, string> = {
  liquidation: 'liquidation-levels',
  'stop-loss': 'stop-loss-levels',
  'take-profit': 'take-profit-levels',
}

export const PRICE_LEVEL_SETTINGS_STORAGE_KEY: Record<PriceLevelKind, string> = {
  liquidation: '0xdeck-widget-liquidation-levels-settings',
  'stop-loss': '0xdeck-widget-stop-loss-levels-settings',
  'take-profit': '0xdeck-widget-take-profit-levels-settings',
}

export const PRICE_LEVEL_KIND_SOURCE: Record<PriceLevelKind, string> = {
  liquidation: 'MarketLens Hyperliquid L4 · open positions (BTC)',
  'stop-loss': 'MarketLens Hyperliquid L4 · resting stop-loss trigger orders (BTC)',
  'take-profit': 'MarketLens Hyperliquid L4 · resting take-profit trigger orders (BTC)',
}

export const PRICE_LEVEL_KIND_DESCRIPTION: Record<PriceLevelKind, string> = {
  liquidation:
    "Live open-position liquidation prices from MarketLens' Hyperliquid L4 feed, drawn on the candle pane.",
  'stop-loss':
    "Live resting stop-loss orders at their trigger price, sized by the position they would close (MarketLens Hyperliquid L4).",
  'take-profit':
    "Live resting take-profit orders at their trigger price, sized by the position they would close (MarketLens Hyperliquid L4).",
}

/** TPSL channel of a trigger-order kind, `null` for the liquidation profile. */
export type TpslKind = Extract<PriceLevelKind, 'stop-loss' | 'take-profit'>

export const TPSL_KIND_CHANNEL: Record<TpslKind, 'stop_losses' | 'take_profits'> = {
  'stop-loss': 'stop_losses',
  'take-profit': 'take_profits',
}

export function isTpslKind(kind: PriceLevelKind): kind is TpslKind {
  return kind === 'stop-loss' || kind === 'take-profit'
}

export function priceLevelKindForIndicator(
  indicatorId: MarketIndicatorId,
): PriceLevelKind | null {
  switch (indicatorId) {
    case 'liquidation-levels':
      return 'liquidation'
    case 'stop-loss-levels':
      return 'stop-loss'
    case 'take-profit-levels':
      return 'take-profit'
    default:
      return null
  }
}
