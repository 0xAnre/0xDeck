import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketPositionMarkers,
  saveWidgetMarketPositionMarkers,
  WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
} from '../marketPositionMarkersStorage.ts'
import {
  isPositionMarkersMenuVisible,
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
  shouldShowPositionMarkers,
} from './positionMarkers.ts'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = {
    get length() {
      return memory.size
    },
    clear() {
      memory.clear()
    },
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
  }
})

afterEach(() => {
  memory.clear()
})

describe('Position Markers setting', () => {
  it('defaults to OFF when unset', () => {
    assert.equal(loadWidgetMarketPositionMarkers('panel-a'), false)
  })

  it('round-trips ON/OFF per widget without leaking across panels', () => {
    saveWidgetMarketPositionMarkers('panel-a', true)
    saveWidgetMarketPositionMarkers('panel-b', false)
    assert.equal(loadWidgetMarketPositionMarkers('panel-a'), true)
    assert.equal(loadWidgetMarketPositionMarkers('panel-b'), false)
    assert.equal(loadWidgetMarketPositionMarkers('panel-c'), false)

    saveWidgetMarketPositionMarkers('panel-a', false)
    assert.equal(loadWidgetMarketPositionMarkers('panel-a'), false)
  })

  it('ignores invalid and corrupt stored values', () => {
    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': 'yes', 'panel-b': 1, 'panel-c': true }),
    )
    assert.equal(loadWidgetMarketPositionMarkers('panel-a'), false)
    assert.equal(loadWidgetMarketPositionMarkers('panel-b'), false)
    assert.equal(loadWidgetMarketPositionMarkers('panel-c'), true)

    memory.set(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY, '{not-json')
    assert.equal(loadWidgetMarketPositionMarkers('panel-a'), false)
  })

  it('defines fixed marker colors for every theme', () => {
    assert.equal(POSITION_MARKER_BUY_COLOR, '#22C55E')
    assert.equal(POSITION_MARKER_SELL_COLOR, '#EF4444')
  })

  it('is visible and active only for Hyperliquid when enabled', () => {
    assert.equal(isPositionMarkersMenuVisible('hyperliquid'), true)
    assert.equal(isPositionMarkersMenuVisible('binance'), false)

    assert.equal(shouldShowPositionMarkers('hyperliquid', true), true)
    assert.equal(shouldShowPositionMarkers('hyperliquid', false), false)
    assert.equal(shouldShowPositionMarkers('binance', true), false)
    assert.equal(shouldShowPositionMarkers('binance', false), false)
  })
})
