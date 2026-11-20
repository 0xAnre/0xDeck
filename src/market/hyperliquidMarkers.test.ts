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
  type HyperliquidMarkerStyle,
} from './hyperliquidMarkers.ts'
import {
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
  POSITION_MARKER_SIZE_DEFAULT,
} from './positionMarkers.ts'

const COLORS: HyperliquidMarkerColors = {
  buy: POSITION_MARKER_BUY_COLOR,
  sell: POSITION_MARKER_SELL_COLOR,
}

/** Side/position/color only — the fields a size change must never touch. */
function hyperliquidFillStyleWithoutSize(style: HyperliquidMarkerStyle) {
  return {
    shape: style.shape,
    position: style.position,
    colorKey: style.colorKey,
  }
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
      size: POSITION_MARKER_SIZE_DEFAULT,
      colorKey: 'buy',
    })
  })

  it('maps sells to the down/arrowDown marker above the bar', () => {
    assert.deepEqual(hyperliquidFillMarkerStyle('A'), {
      shape: 'arrowDown',
      position: 'aboveBar',
      size: POSITION_MARKER_SIZE_DEFAULT,
      colorKey: 'sell',
    })
  })

  it('defaults the arrow size to 1.25x instead of the fixed 1.5 from #241', () => {
    assert.equal(POSITION_MARKER_SIZE_DEFAULT, 1.25)
    assert.equal(hyperliquidFillMarkerStyle('B').size, 1.25)
    assert.equal(hyperliquidFillMarkerStyle('A').size, 1.25)
    assert.equal(hyperliquidFillGroupMarker(group('A'), COLORS).size, 1.25)
  })

  it('carries the user size to both sides without changing anything else', () => {
    for (const size of [0.5, 1.75, 3]) {
      const buy = hyperliquidFillMarkerStyle('B', size)
      const sell = hyperliquidFillMarkerStyle('A', size)
      assert.equal(buy.size, size)
      assert.equal(sell.size, size)
      assert.deepEqual(hyperliquidFillStyleWithoutSize(buy), {
        shape: 'arrowUp',
        position: 'belowBar',
        colorKey: 'buy',
      })
      assert.deepEqual(hyperliquidFillStyleWithoutSize(sell), {
        shape: 'arrowDown',
        position: 'aboveBar',
        colorKey: 'sell',
      })
    }
  })

  it('renders grouped markers at the requested size and keeps id/time/color', () => {
    const markers = hyperliquidFillGroupsToMarkers(
      [group('B'), group('A')],
      COLORS,
      2,
    )
    assert.deepEqual(
      markers.map((marker) => marker.size),
      [2, 2],
    )
    assert.deepEqual(
      markers.map((marker) => marker.id),
      ['1791997200:B', '1791997200:A'],
    )
    assert.deepEqual(
      markers.map((marker) => marker.time),
      [1_791_997_200, 1_791_997_200],
    )
    assert.deepEqual(
      markers.map((marker) => marker.color),
      [COLORS.buy, COLORS.sell],
    )
  })

  it('clamps an invalid size instead of rendering it', () => {
    assert.equal(hyperliquidFillMarkerStyle('B', 99).size, 3)
    assert.equal(hyperliquidFillMarkerStyle('A', 0.1).size, 0.5)
    assert.equal(hyperliquidFillMarkerStyle('B', Number.NaN).size, 1.25)
    assert.equal(hyperliquidFillGroupsToMarkers([group('B')], COLORS, 1.3)[0]?.size, 1.25)
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
    const expectedSize = hyperliquidFillMarkerStyle('B').size
    assert.ok(markers.every((marker) => marker.size === expectedSize))
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
