import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bucketHyperliquidFillEvents,
  classifyHyperliquidFills,
  type BucketedHyperliquidFillEvent,
} from './hyperliquidFills.ts'
import {
  hyperliquidFillEventMarker,
  hyperliquidFillEventMarkerStyle,
  hyperliquidFillEventsToMarkers,
  type HyperliquidMarkerColors,
} from './hyperliquidMarkers.ts'

const COLORS: HyperliquidMarkerColors = {
  longEntry: 'rgb(1, 2, 3)',
  shortEntry: 'rgb(4, 5, 6)',
  reduce: 'rgb(7, 8, 9)',
  close: 'rgb(10, 11, 12)',
}

function event(kind: 'entry' | 'reduce' | 'close', side: 'long' | 'short'): BucketedHyperliquidFillEvent {
  return {
    key: `${kind}-${side}`,
    kind,
    side,
    price: 80000,
    size: 1,
    time: 1_792_000_000_000,
    direction: null,
    tid: 1,
    positionBefore: 1,
    positionAfter: 0,
    bucketTime: 1_792_000_000,
  }
}

describe('Hyperliquid marker mapping', () => {
  it('maps long entries to a green up arrow below the bar', () => {
    assert.deepEqual(hyperliquidFillEventMarkerStyle(event('entry', 'long')), {
      shape: 'arrowUp',
      position: 'belowBar',
      size: 1,
      colorKey: 'longEntry',
    })
  })

  it('maps short entries to a red down arrow above the bar', () => {
    assert.deepEqual(hyperliquidFillEventMarkerStyle(event('entry', 'short')), {
      shape: 'arrowDown',
      position: 'aboveBar',
      size: 1,
      colorKey: 'shortEntry',
    })
  })

  it('maps partial closes to a circle so they cannot read as a close', () => {
    assert.deepEqual(hyperliquidFillEventMarkerStyle(event('reduce', 'long')), {
      shape: 'circle',
      position: 'aboveBar',
      size: 1,
      colorKey: 'reduce',
    })
  })

  it('maps full closes to a muted square', () => {
    assert.deepEqual(hyperliquidFillEventMarkerStyle(event('close', 'short')), {
      shape: 'square',
      position: 'aboveBar',
      size: 1,
      colorKey: 'close',
    })
  })

  it('uses the candle bucket as the marker time and a stable id', () => {
    const marker = hyperliquidFillEventMarker(event('entry', 'long'), COLORS)
    assert.equal(marker.time, 1_792_000_000)
    assert.equal(marker.id, 'entry-long')
    assert.equal(marker.color, COLORS.longEntry)
    assert.equal(marker.text, undefined)
  })

  it('emits one marker per classified event (no data dropped)', () => {
    const events = classifyHyperliquidFills([
      {
        coin: 'BTC',
        px: '80000',
        sz: '1',
        side: 'B',
        time: 1_792_000_000_000,
        startPosition: '0',
        tid: 1,
      },
      {
        coin: 'BTC',
        px: '80010',
        sz: '1.5',
        side: 'A',
        time: 1_792_000_030_000,
        startPosition: '1',
        tid: 2,
      },
    ])
    const bucketed = bucketHyperliquidFillEvents(events, '1m')
    const markers = hyperliquidFillEventsToMarkers(bucketed, COLORS)
    assert.equal(markers.length, 3)
    assert.deepEqual(markers.map((marker) => marker.shape), [
      'arrowUp',
      'square',
      'arrowDown',
    ])
    assert.equal(new Set(markers.map((marker) => marker.id)).size, 3)
  })
})
