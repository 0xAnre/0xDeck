/**
 * Marker mapping for Hyperliquid account fills.
 *
 * Visuals are side-only: buys are green/up-token upward arrows below the bar,
 * sells are red/down-token downward arrows above the bar. Both sides share one
 * user-adjustable arrow size (default 1.25×, `POSITION_MARKER_SIZE_DEFAULT`).
 * At most one buy and one sell marker are rendered per candle bucket.
 */
import type { SeriesMarker, SeriesMarkerShape, UTCTimestamp } from 'lightweight-charts'
import type { HyperliquidFillMarkerGroup } from './hyperliquidFills.ts'
import {
  POSITION_MARKER_SIZE_DEFAULT,
  sanitizePositionMarkerSize,
} from './positionMarkers.ts'

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

/**
 * Pure side → shape/position/color/size mapping, shared by the chart and tests.
 *
 * `size` is the user's marker size (`SeriesMarker.size`, a multiple of the
 * lightweight-charts default of 1). It is presentation-only, so it never
 * changes side, shape, position or color, and it is clamped/stepped here so an
 * invalid persisted value can never reach the chart.
 */
export function hyperliquidFillMarkerStyle(
  side: HyperliquidFillMarkerGroup['side'],
  size: number = POSITION_MARKER_SIZE_DEFAULT,
): HyperliquidMarkerStyle {
  const markerSize = sanitizePositionMarkerSize(size)
  return side === 'B'
    ? { shape: 'arrowUp', position: 'belowBar', size: markerSize, colorKey: 'buy' }
    : {
        shape: 'arrowDown',
        position: 'aboveBar',
        size: markerSize,
        colorKey: 'sell',
      }
}

export function hyperliquidFillGroupMarker(
  group: HyperliquidFillMarkerGroup,
  colors: HyperliquidMarkerColors,
  size: number = POSITION_MARKER_SIZE_DEFAULT,
): SeriesMarker<UTCTimestamp> {
  const style = hyperliquidFillMarkerStyle(group.side, size)
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
  size: number = POSITION_MARKER_SIZE_DEFAULT,
): SeriesMarker<UTCTimestamp>[] {
  return groups.map((group) => hyperliquidFillGroupMarker(group, colors, size))
}
