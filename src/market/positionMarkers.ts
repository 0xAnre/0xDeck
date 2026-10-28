import {
  MARKET_SEMANTIC_NEGATIVE_COLOR,
  MARKET_SEMANTIC_POSITIVE_COLOR,
} from './marketSemanticColors.ts'
import type { MarketExchange } from './types.ts'

/** User requirement: fixed account-marker colors in every theme (light and dark). */
export const POSITION_MARKER_BUY_COLOR = MARKET_SEMANTIC_POSITIVE_COLOR
export const POSITION_MARKER_SELL_COLOR = MARKET_SEMANTIC_NEGATIVE_COLOR

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
