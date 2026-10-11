import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketChartViewport,
  saveWidgetMarketChartViewport,
  WIDGET_MARKET_CHART_VIEWPORT_STORAGE_KEY,
} from '../marketChartViewportStorage.ts'

const memory = new Map<string, string>()

const sampleViewport = {
  version: 1 as const,
  visibleLogicalRange: { from: 100, to: 200 },
  visibleTimeRange: { from: 1_700_000_000, to: 1_700_001_000 },
  autoScale: true,
  priceRange: null,
  scaleMargins: { top: 0.1, bottom: 0.1 },
  rightOffset: 8,
}

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

describe('marketChartViewportStorage', () => {
  it('returns null when panel or interval has no saved viewport', () => {
    assert.equal(loadWidgetMarketChartViewport('panel-a', '1m'), null)
  })

  it('isolates viewports per panel id', () => {
    saveWidgetMarketChartViewport('panel-a', '1m', {
      ...sampleViewport,
      visibleTimeRange: { from: 1_700_000_000, to: 1_700_000_100 },
    })
    saveWidgetMarketChartViewport('panel-b', '1m', {
      ...sampleViewport,
      visibleTimeRange: { from: 1_700_000_200, to: 1_700_000_300 },
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1m')?.visibleTimeRange, {
      from: 1_700_000_000,
      to: 1_700_000_100,
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-b', '1m')?.visibleTimeRange, {
      from: 1_700_000_200,
      to: 1_700_000_300,
    })
  })

  it('scopes saved viewport by timeframe', () => {
    saveWidgetMarketChartViewport('panel-a', '1m', sampleViewport)
    saveWidgetMarketChartViewport('panel-a', '1h', {
      ...sampleViewport,
      visibleTimeRange: { from: 1_700_100_000, to: 1_700_200_000 },
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1m')?.visibleTimeRange, {
      from: 1_700_000_000,
      to: 1_700_001_000,
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1h')?.visibleTimeRange, {
      from: 1_700_100_000,
      to: 1_700_200_000,
    })
    assert.equal(loadWidgetMarketChartViewport('panel-a', '5m'), null)
  })

  it('ignores corrupt JSON and invalid entries', () => {
    memory.set(WIDGET_MARKET_CHART_VIEWPORT_STORAGE_KEY, '{bad-json')
    assert.equal(loadWidgetMarketChartViewport('panel-a', '1m'), null)

    memory.set(
      WIDGET_MARKET_CHART_VIEWPORT_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          '1m': {
            version: 1,
            visibleLogicalRange: { from: 0, to: 1 },
            visibleTimeRange: { from: 5, to: 5 },
          },
          '1h': sampleViewport,
          bogus: sampleViewport,
        },
      }),
    )
    assert.equal(loadWidgetMarketChartViewport('panel-a', '1m'), null)
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1h')?.visibleTimeRange, {
      from: 1_700_000_000,
      to: 1_700_001_000,
    })
  })
})
