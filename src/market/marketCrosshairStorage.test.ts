import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketCrosshairEnabled,
  saveWidgetMarketCrosshairEnabled,
  WIDGET_MARKET_CROSSHAIR_STORAGE_KEY,
} from '../marketCrosshairStorage.ts'

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

describe('marketCrosshairStorage', () => {
  it('defaults to enabled when panel has no entry', () => {
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-a'), true)
  })

  it('isolates crosshair preference per panel id', () => {
    saveWidgetMarketCrosshairEnabled('panel-a', false)
    saveWidgetMarketCrosshairEnabled('panel-b', true)
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-a'), false)
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-b'), true)
  })

  it('falls back to enabled for missing, malformed, or invalid stored data', () => {
    memory.set(WIDGET_MARKET_CROSSHAIR_STORAGE_KEY, '{bad-json')
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-a'), true)

    memory.set(
      WIDGET_MARKET_CROSSHAIR_STORAGE_KEY,
      JSON.stringify({ 'panel-a': 'off', 'panel-b': 0, 'panel-c': false }),
    )
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-a'), true)
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-b'), true)
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-c'), false)
    assert.equal(loadWidgetMarketCrosshairEnabled('panel-missing'), true)
  })
})
