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
  logicalRange: { from: 1, to: 50 },
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
      logicalRange: { from: 0, to: 10 },
    })
    saveWidgetMarketChartViewport('panel-b', '1m', {
      ...sampleViewport,
      logicalRange: { from: 20, to: 30 },
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1m')?.logicalRange, {
      from: 0,
      to: 10,
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-b', '1m')?.logicalRange, {
      from: 20,
      to: 30,
    })
  })

  it('scopes saved viewport by timeframe', () => {
    saveWidgetMarketChartViewport('panel-a', '1m', sampleViewport)
    saveWidgetMarketChartViewport('panel-a', '1h', {
      ...sampleViewport,
      logicalRange: { from: 100, to: 200 },
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1m')?.logicalRange, {
      from: 1,
      to: 50,
    })
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1h')?.logicalRange, {
      from: 100,
      to: 200,
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
          '1m': { version: 1, logicalRange: { from: 5, to: 5 } },
          '1h': sampleViewport,
          bogus: sampleViewport,
        },
      }),
    )
    assert.equal(loadWidgetMarketChartViewport('panel-a', '1m'), null)
    assert.deepEqual(loadWidgetMarketChartViewport('panel-a', '1h')?.logicalRange, {
      from: 1,
      to: 50,
    })
  })
})
