import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
  sanitizeOrderBookDepthSettings,
} from './orderBookDepthSettings.ts'
import {
  WIDGET_ORDER_BOOK_DEPTH_SETTINGS_STORAGE_KEY,
  loadWidgetOrderBookDepthSettings,
  saveWidgetOrderBookDepthSettings,
} from '../orderBookDepthSettingsStorage.ts'

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
  } as Storage
})

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).localStorage
})

describe('sanitizeOrderBookDepthSettings', () => {
  it('falls back to the documented defaults for missing or malformed values', () => {
    assert.deepEqual(
      sanitizeOrderBookDepthSettings(null),
      DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    )
    assert.deepEqual(
      sanitizeOrderBookDepthSettings({
        source: 'hyperliquid',
        distance: 3,
        positiveThreshold: 'high',
        negativeThreshold: null,
      }),
      DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    )
  })

  it('keeps valid per-distance and threshold values', () => {
    assert.deepEqual(
      sanitizeOrderBookDepthSettings({
        source: 'binance',
        distance: 0.5,
        positiveThreshold: 60,
        negativeThreshold: -40,
      }),
      {
        source: 'binance',
        distance: 0.5,
        positiveThreshold: 60,
        negativeThreshold: -40,
      },
    )
  })

  it('rejects inverted or out-of-range threshold pairs', () => {
    for (const thresholds of [
      { positiveThreshold: -30, negativeThreshold: 30 },
      { positiveThreshold: 101, negativeThreshold: -25 },
      { positiveThreshold: 25, negativeThreshold: -101 },
    ]) {
      assert.deepEqual(
        sanitizeOrderBookDepthSettings({
          source: 'binance',
          distance: 2.5,
          ...thresholds,
        }),
        DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
      )
    }
  })
})

describe('widget Order Book Depth settings storage', () => {
  it('round-trips per-widget settings without touching other panels', () => {
    saveWidgetOrderBookDepthSettings('panel-a', {
      source: 'binance',
      distance: 1,
      positiveThreshold: 50,
      negativeThreshold: -50,
    })
    saveWidgetOrderBookDepthSettings('panel-b', DEFAULT_ORDER_BOOK_DEPTH_SETTINGS)

    assert.deepEqual(loadWidgetOrderBookDepthSettings('panel-a'), {
      source: 'binance',
      distance: 1,
      positiveThreshold: 50,
      negativeThreshold: -50,
    })
    assert.deepEqual(
      loadWidgetOrderBookDepthSettings('panel-b'),
      DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    )
    assert.deepEqual(
      loadWidgetOrderBookDepthSettings('missing-panel'),
      DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    )
    assert.equal(
      memory.has(WIDGET_ORDER_BOOK_DEPTH_SETTINGS_STORAGE_KEY),
      true,
    )
  })

  it('sanitizes stored values on read and write', () => {
    memory.set(
      WIDGET_ORDER_BOOK_DEPTH_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          source: 'hyperliquid',
          distance: 2.5,
          positiveThreshold: 10,
          negativeThreshold: -10,
        },
      }),
    )
    assert.deepEqual(loadWidgetOrderBookDepthSettings('panel-a'), {
      source: 'binance',
      distance: 2.5,
      positiveThreshold: 10,
      negativeThreshold: -10,
    })

    saveWidgetOrderBookDepthSettings('panel-a', {
      source: 'binance',
      distance: 99 as never,
      positiveThreshold: 25,
      negativeThreshold: -25,
    })
    assert.deepEqual(loadWidgetOrderBookDepthSettings('panel-a'), {
      source: 'binance',
      distance: 2.5,
      positiveThreshold: 25,
      negativeThreshold: -25,
    })
  })
})
