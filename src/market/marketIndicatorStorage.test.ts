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

describe('marketIndicatorStorage dual-ema', () => {
  const panelId = 'btc-perp-test-panel'

  it('round-trips dual-ema with triple-ema independently', () => {
    saveWidgetMarketIndicators(panelId, ['triple-ema', 'dual-ema'])
    assert.deepEqual(loadWidgetMarketIndicators(panelId), ['triple-ema', 'dual-ema'])
  })

  it('sanitizes unknown ids while preserving dual-ema', () => {
    const key = WIDGET_MARKET_INDICATORS_STORAGE_KEY
    localStorage.setItem(
      key,
      JSON.stringify({ [panelId]: ['dual-ema', 'sma-200', 'triple-ema', 'dual-ema'] }),
    )
    assert.deepEqual(loadWidgetMarketIndicators(panelId), ['dual-ema', 'triple-ema'])
  })

  it('migrates legacy ema-200 to dual-ema', () => {
    const key = WIDGET_MARKET_INDICATORS_STORAGE_KEY
    localStorage.setItem(key, JSON.stringify({ [panelId]: ['ema-200', 'triple-ema'] }))
    assert.deepEqual(loadWidgetMarketIndicators(panelId), ['dual-ema', 'triple-ema'])
  })

  it('deduplicates when legacy ema-200 and dual-ema are both stored', () => {
    const key = WIDGET_MARKET_INDICATORS_STORAGE_KEY
    localStorage.setItem(key, JSON.stringify({ [panelId]: ['ema-200', 'dual-ema'] }))
    assert.deepEqual(loadWidgetMarketIndicators(panelId), ['dual-ema'])
  })
})
