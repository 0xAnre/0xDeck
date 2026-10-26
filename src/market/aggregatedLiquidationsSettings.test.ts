import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
  sanitizeAggregatedLiquidationsSettings,
} from './aggregatedLiquidationsSettings.ts'
import {
  loadWidgetLiquidationsSettings,
  saveWidgetLiquidationsSettings,
  WIDGET_LIQUIDATIONS_SETTINGS_STORAGE_KEY,
} from '../liquidationsSettingsStorage.ts'

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

describe('sanitizeAggregatedLiquidationsSettings', () => {
  it('falls back to Binance/bottom for missing or malformed values', () => {
    assert.deepEqual(
      sanitizeAggregatedLiquidationsSettings(null),
      DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
    )
    assert.deepEqual(
      sanitizeAggregatedLiquidationsSettings({ source: 'nope', position: 'middle' }),
      DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
    )
  })

  it('keeps a valid top position but never enables a non-Binance source in V1', () => {
    assert.deepEqual(
      sanitizeAggregatedLiquidationsSettings({ source: 'binance', position: 'top' }),
      { source: 'binance', position: 'top' },
    )
    for (const source of ['hyperliquid', 'both']) {
      assert.deepEqual(
        sanitizeAggregatedLiquidationsSettings({ source, position: 'top' }),
        { source: 'binance', position: 'top' },
      )
    }
  })
})

describe('widget liquidation settings storage', () => {
  it('round-trips per-widget settings', () => {
    saveWidgetLiquidationsSettings('panel-a', { source: 'binance', position: 'top' })
    saveWidgetLiquidationsSettings('panel-b', { source: 'binance', position: 'bottom' })
    assert.deepEqual(loadWidgetLiquidationsSettings('panel-a'), {
      source: 'binance',
      position: 'top',
    })
    assert.deepEqual(loadWidgetLiquidationsSettings('panel-b'), {
      source: 'binance',
      position: 'bottom',
    })
  })

  it('returns defaults for unknown panels', () => {
    assert.deepEqual(
      loadWidgetLiquidationsSettings('missing'),
      DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
    )
  })

  it('sanitizes invalid persisted values on read', () => {
    localStorage.setItem(
      WIDGET_LIQUIDATIONS_SETTINGS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': { source: 'both', position: 'sideways' } }),
    )
    assert.deepEqual(
      loadWidgetLiquidationsSettings('panel-a'),
      DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
    )
  })

  it('ignores malformed storage JSON instead of throwing', () => {
    localStorage.setItem(WIDGET_LIQUIDATIONS_SETTINGS_STORAGE_KEY, '{not-json')
    assert.deepEqual(
      loadWidgetLiquidationsSettings('panel-a'),
      DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
    )
  })
})
