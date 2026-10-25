/**
 * Marker mapping for Hyperliquid account fills.
 *
 * Visuals stay small and unobtrusive: entries are arrows, partial closes are
 * circles (so they can never read as a close), full closes are squares. Colors
 * are injected from resolved theme tokens — no hardcoded hex here.
 */
import type { SeriesMarker, SeriesMarkerShape, UTCTimestamp } from 'lightweight-charts'
import type { BucketedHyperliquidFillEvent } from './hyperliquidFills.ts'

export type HyperliquidMarkerColors = {
  longEntry: string
  shortEntry: string
  reduce: string
  close: string
}

export type HyperliquidMarkerStyle = {
  shape: SeriesMarkerShape
  position: 'aboveBar' | 'belowBar'
  size: number
  colorKey: keyof HyperliquidMarkerColors
}

/** Pure shape/position/color mapping, shared by the chart and tests. */
export function hyperliquidFillEventMarkerStyle(
  event: Pick<BucketedHyperliquidFillEvent, 'kind' | 'side'>,
): HyperliquidMarkerStyle {
  if (event.kind === 'entry') {
    return event.side === 'long'
      ? { shape: 'arrowUp', position: 'belowBar', size: 1, colorKey: 'longEntry' }
      : { shape: 'arrowDown', position: 'aboveBar', size: 1, colorKey: 'shortEntry' }
  }
  if (event.kind === 'reduce') {
    return { shape: 'circle', position: 'aboveBar', size: 1, colorKey: 'reduce' }
  }
  return { shape: 'square', position: 'aboveBar', size: 1, colorKey: 'close' }
}

export function hyperliquidFillEventMarker(
  event: BucketedHyperliquidFillEvent,
  colors: HyperliquidMarkerColors,
): SeriesMarker<UTCTimestamp> {
  const style = hyperliquidFillEventMarkerStyle(event)
  return {
    id: event.key,
    time: event.bucketTime as UTCTimestamp,
    position: style.position,
    shape: style.shape,
    size: style.size,
    color: colors[style.colorKey],
  }
}

export function hyperliquidFillEventsToMarkers(
  events: readonly BucketedHyperliquidFillEvent[],
  colors: HyperliquidMarkerColors,
): SeriesMarker<UTCTimestamp>[] {
  return events.map((event) => hyperliquidFillEventMarker(event, colors))
}
