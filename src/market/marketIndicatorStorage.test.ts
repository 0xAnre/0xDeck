import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketIndicators,
  saveWidgetMarketIndicators,
  WIDGET_MARKET_INDICATORS_STORAGE_KEY,
} from '../marketIndicatorStorage.ts'

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

describe('marketIndicatorStorage ema-200', () => {
  const panelId = 'btc-perp-test-panel'

  it('round-trips ema-200 with triple-ema independently', () => {
    saveWidgetMarketIndicators(panelId, ['triple-ema', 'ema-200'])
    assert.deepEqual(loadWidgetMarketIndicators(panelId), ['triple-ema', 'ema-200'])
  })

  it('sanitizes unknown ids while preserving ema-200', () => {
    const key = WIDGET_MARKET_INDICATORS_STORAGE_KEY
    localStorage.setItem(
      key,
      JSON.stringify({ [panelId]: ['ema-200', 'sma-200', 'triple-ema', 'ema-200'] }),
    )
    assert.deepEqual(loadWidgetMarketIndicators(panelId), ['ema-200', 'triple-ema'])
  })
})
