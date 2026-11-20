import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketPositionMarkerSettings,
  saveWidgetMarketPositionMarkerSettings,
  WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
} from '../marketPositionMarkersStorage.ts'
import {
  DEFAULT_POSITION_MARKER_SETTINGS,
  isPositionMarkersMenuVisible,
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
  POSITION_MARKER_SIZE_DEFAULT,
  POSITION_MARKER_SIZE_MAX,
  POSITION_MARKER_SIZE_MIN,
  POSITION_MARKER_SIZE_STEP,
  positionMarkerSizeLabel,
  sanitizePositionMarkerSettings,
  sanitizePositionMarkerSize,
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

function storedMap(): Record<string, unknown> {
  const raw = memory.get(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY)
  assert.ok(raw, 'expected a stored Position Markers record')
  return JSON.parse(raw) as Record<string, unknown>
}

describe('Position Markers size bounds', () => {
  it('declares the agreed range, step and default', () => {
    assert.equal(POSITION_MARKER_SIZE_MIN, 0.5)
    assert.equal(POSITION_MARKER_SIZE_MAX, 3)
    assert.equal(POSITION_MARKER_SIZE_STEP, 0.25)
    assert.equal(POSITION_MARKER_SIZE_DEFAULT, 1.25)
    // #241's fixed 1.5 multiplier is no longer the default.
    assert.notEqual(POSITION_MARKER_SIZE_DEFAULT, 1.5)
    assert.deepEqual(DEFAULT_POSITION_MARKER_SETTINGS, { enabled: false, size: 1.25 })
  })

  it('clamps values outside the range to the nearest bound', () => {
    assert.equal(sanitizePositionMarkerSize(0), 0.5)
    assert.equal(sanitizePositionMarkerSize(0.1), 0.5)
    assert.equal(sanitizePositionMarkerSize(-5), 0.5)
    assert.equal(sanitizePositionMarkerSize(3.1), 3)
    assert.equal(sanitizePositionMarkerSize(10), 3)
    assert.equal(sanitizePositionMarkerSize(Number.MAX_SAFE_INTEGER), 3)
  })

  it('rounds in-range values to the 0.25 step', () => {
    assert.equal(sanitizePositionMarkerSize(0.62), 0.5)
    assert.equal(sanitizePositionMarkerSize(0.74), 0.75)
    assert.equal(sanitizePositionMarkerSize(1.13), 1.25)
    assert.equal(sanitizePositionMarkerSize(1.3), 1.25)
    assert.equal(sanitizePositionMarkerSize(1.4), 1.5)
    assert.equal(sanitizePositionMarkerSize(2.9), 3)
  })

  it('keeps step-aligned values untouched', () => {
    for (let size = POSITION_MARKER_SIZE_MIN; size <= POSITION_MARKER_SIZE_MAX; size += 0.25) {
      assert.equal(sanitizePositionMarkerSize(size), size)
    }
  })

  it('falls back to the default for non-numeric input', () => {
    for (const value of [
      undefined,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '2',
      '1.25×',
      {},
      [],
      true,
    ]) {
      assert.equal(sanitizePositionMarkerSize(value), 1.25)
    }
  })

  it('formats the slider readout as a multiple of the default', () => {
    assert.equal(positionMarkerSizeLabel(1.25), '1.25×')
    assert.equal(positionMarkerSizeLabel(0.5), '0.5×')
    assert.equal(positionMarkerSizeLabel(1), '1×')
    assert.equal(positionMarkerSizeLabel(3), '3×')
    assert.equal(positionMarkerSizeLabel('nope'), '1.25×')
  })
})

describe('Position Markers settings record', () => {
  it('migrates a legacy boolean to enabled + default size', () => {
    assert.deepEqual(sanitizePositionMarkerSettings(true), { enabled: true, size: 1.25 })
    assert.deepEqual(sanitizePositionMarkerSettings(false), { enabled: false, size: 1.25 })
  })

  it('sanitizes the object form and keeps a valid size', () => {
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true, size: 2 }), {
      enabled: true,
      size: 2,
    })
    // Clamped, then stepped.
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true, size: 99 }), {
      enabled: true,
      size: 3,
    })
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true, size: 1.3 }), {
      enabled: true,
      size: 1.25,
    })
    // A missing/invalid size falls back to the default, not to OFF.
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true }), {
      enabled: true,
      size: 1.25,
    })
  })

  it('treats anything unreadable as OFF at the default size', () => {
    for (const value of [undefined, null, 1, 'yes', [], {}]) {
      assert.deepEqual(sanitizePositionMarkerSettings(value), {
        enabled: false,
        size: 1.25,
      })
    }
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: 'true', size: '2' }), {
      enabled: false,
      size: 1.25,
    })
  })
})

describe('Position Markers storage', () => {
  it('defaults to OFF at the default size when unset', () => {
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 1.25,
    })
  })

  it('round-trips toggle and size per widget without leaking across panels', () => {
    saveWidgetMarketPositionMarkerSettings('panel-a', { enabled: true, size: 2 })
    saveWidgetMarketPositionMarkerSettings('panel-b', { enabled: false, size: 0.75 })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: true,
      size: 2,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-b'), {
      enabled: false,
      size: 0.75,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-c'), {
      enabled: false,
      size: 1.25,
    })

    saveWidgetMarketPositionMarkerSettings('panel-a', { enabled: false, size: 3 })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 3,
    })
  })

  it('keeps the same storage key and migrates a stored legacy boolean', () => {
    assert.equal(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY, '0xdeck-widget-market-position-markers')
    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': true, 'panel-b': false }),
    )
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: true,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-b'), {
      enabled: false,
      size: 1.25,
    })
  })

  it('rewrites migrated entries in the object shape on the next save', () => {
    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': true }),
    )
    saveWidgetMarketPositionMarkerSettings('panel-b', { enabled: true, size: 1.75 })

    assert.deepEqual(storedMap(), {
      'panel-a': { enabled: true, size: 1.25 },
      'panel-b': { enabled: true, size: 1.75 },
    })
  })

  it('sanitizes on write and ignores invalid and corrupt stored values', () => {
    saveWidgetMarketPositionMarkerSettings('panel-a', { enabled: true, size: 4 })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: true,
      size: 3,
    })
    assert.deepEqual(storedMap(), { 'panel-a': { enabled: true, size: 3 } })

    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({
        'panel-a': 'yes',
        'panel-b': 1,
        'panel-c': true,
        'panel-d': { enabled: true, size: '2' },
      }),
    )
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-b'), {
      enabled: false,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-c'), {
      enabled: true,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-d'), {
      enabled: true,
      size: 1.25,
    })

    memory.set(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY, '{not-json')
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 1.25,
    })
  })
})

describe('Position Markers meaning', () => {
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
