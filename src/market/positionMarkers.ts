import type { MarketExchange } from './types.ts'

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
