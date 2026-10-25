import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bucketHyperliquidFills,
  groupHyperliquidFillMarkers,
  parseHyperliquidFill,
} from './hyperliquidFills.ts'
import {
  hyperliquidFillGroupMarker,
  hyperliquidFillGroupsToMarkers,
  hyperliquidFillMarkerStyle,
  type HyperliquidMarkerColors,
} from './hyperliquidMarkers.ts'
import {
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
} from './positionMarkers.ts'

const COLORS: HyperliquidMarkerColors = {
  buy: POSITION_MARKER_BUY_COLOR,
  sell: POSITION_MARKER_SELL_COLOR,
}

function group(side: 'B' | 'A') {
  const fill = parseHyperliquidFill({
    coin: 'BTC',
    px: '80000',
    sz: '1',
    side,
    time: 1_792_000_000_000,
    tid: side === 'B' ? 1 : 2,
  })
  assert.ok(fill)
  return groupHyperliquidFillMarkers(bucketHyperliquidFills([fill], '1h'))[0]
}

describe('Hyperliquid side-only marker mapping', () => {
  it('maps buys to the up/arrowUp marker below the bar', () => {
    assert.deepEqual(hyperliquidFillMarkerStyle('B'), {
      shape: 'arrowUp',
      position: 'belowBar',
      size: 1,
      colorKey: 'buy',
    })
  })

  it('maps sells to the down/arrowDown marker above the bar', () => {
    assert.deepEqual(hyperliquidFillMarkerStyle('A'), {
      shape: 'arrowDown',
      position: 'aboveBar',
      size: 1,
      colorKey: 'sell',
    })
  })

  it('uses fixed buy/sell colors in every theme', () => {
    assert.equal(POSITION_MARKER_BUY_COLOR, '#22C55E')
    assert.equal(POSITION_MARKER_SELL_COLOR, '#EF4444')
    assert.equal(hyperliquidFillGroupMarker(group('B'), COLORS).color, '#22C55E')
    assert.equal(hyperliquidFillGroupMarker(group('A'), COLORS).color, '#EF4444')
  })

  it('uses the candle bucket as the marker time and a stable bucket+side id', () => {
    const marker = hyperliquidFillGroupMarker(group('B'), COLORS)
    assert.equal(marker.time, 1_791_997_200)
    assert.equal(marker.id, '1791997200:B')
    assert.equal(marker.color, COLORS.buy)
    assert.equal(marker.text, undefined)
  })

  it('emits at most one buy and one sell marker per candle bucket', () => {
    const fills = ['B', 'B', 'A', 'A', 'B'].map((side, index) => {
      const fill = parseHyperliquidFill({
        coin: 'BTC',
        px: '80000',
        sz: '1',
        side,
        time: 1_792_000_000_000 + index * 1000,
        tid: index + 1,
      })
      assert.ok(fill)
      return fill
    })
    const groups = groupHyperliquidFillMarkers(bucketHyperliquidFills(fills, '1m'))
    const markers = hyperliquidFillGroupsToMarkers(groups, COLORS)
    assert.equal(markers.length, 2)
    assert.deepEqual(markers.map((marker) => marker.shape), ['arrowUp', 'arrowDown'])
    assert.equal(new Set(markers.map((marker) => marker.id)).size, 2)
  })

  it('never produces close/reduce shapes or marker text', () => {
    const markers = hyperliquidFillGroupsToMarkers(
      [group('B'), group('A')],
      COLORS,
    )
    assert.deepEqual(markers.map((marker) => marker.shape), ['arrowUp', 'arrowDown'])
    assert.ok(markers.every((marker) => marker.text === undefined))
    assert.ok(!markers.some((marker) => marker.shape === 'circle' || marker.shape === 'square'))
  })
})
