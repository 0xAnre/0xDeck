/**
 * Marker mapping for Hyperliquid account fills.
 *
 * Visuals are side-only and stay small: buys are green/up-token upward arrows
 * below the bar, sells are red/down-token downward arrows above the bar. At
 * most one buy and one sell marker are rendered per candle bucket.
 */
import type { SeriesMarker, SeriesMarkerShape, UTCTimestamp } from 'lightweight-charts'
import type { HyperliquidFillMarkerGroup } from './hyperliquidFills.ts'

export type HyperliquidMarkerColors = {
  buy: string
  sell: string
}

export type HyperliquidMarkerStyle = {
  shape: SeriesMarkerShape
  position: 'aboveBar' | 'belowBar'
  size: number
  colorKey: keyof HyperliquidMarkerColors
}

/** Pure side → shape/position/color mapping, shared by the chart and tests. */
export function hyperliquidFillMarkerStyle(
  side: HyperliquidFillMarkerGroup['side'],
): HyperliquidMarkerStyle {
  return side === 'B'
    ? { shape: 'arrowUp', position: 'belowBar', size: 1, colorKey: 'buy' }
    : { shape: 'arrowDown', position: 'aboveBar', size: 1, colorKey: 'sell' }
}

export function hyperliquidFillGroupMarker(
  group: HyperliquidFillMarkerGroup,
  colors: HyperliquidMarkerColors,
): SeriesMarker<UTCTimestamp> {
  const style = hyperliquidFillMarkerStyle(group.side)
  return {
    id: group.key,
    time: group.bucketTime as UTCTimestamp,
    position: style.position,
    shape: style.shape,
    size: style.size,
    color: colors[style.colorKey],
  }
}

export function hyperliquidFillGroupsToMarkers(
  groups: readonly HyperliquidFillMarkerGroup[],
  colors: HyperliquidMarkerColors,
): SeriesMarker<UTCTimestamp>[] {
  return groups.map((group) => hyperliquidFillGroupMarker(group, colors))
}
