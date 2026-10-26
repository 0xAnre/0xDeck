import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetRsiSettings,
  saveWidgetRsiSettings,
  WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY,
} from '../marketRsiSettingsStorage.ts'
import { createDefaultRsiSettings } from './rsi.ts'

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
  memory.clear()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).localStorage
})

describe('marketRsiSettingsStorage', () => {
  it('returns the default settings for an unknown panel', () => {
    assert.deepEqual(loadWidgetRsiSettings('panel-a'), createDefaultRsiSettings())
  })

  it('round-trips settings per widget instance', () => {
    saveWidgetRsiSettings('panel-a', { period: 21, overbought: 80, oversold: 20 })
    saveWidgetRsiSettings('panel-b', { period: 7, overbought: 75, oversold: 25 })

    assert.deepEqual(loadWidgetRsiSettings('panel-a'), {
      period: 21,
      overbought: 80,
      oversold: 20,
    })
    assert.deepEqual(loadWidgetRsiSettings('panel-b'), {
      period: 7,
      overbought: 75,
      oversold: 25,
    })
    assert.ok(memory.has(WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY))
  })

  it('sanitizes values on save', () => {
    saveWidgetRsiSettings('panel-a', { period: 0, overbought: 500, oversold: 80 })
    assert.deepEqual(loadWidgetRsiSettings('panel-a'), {
      period: 2,
      overbought: 100,
      oversold: 80,
    })
  })

  it('sanitizes corrupt stored values on load', () => {
    localStorage.setItem(
      WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': { period: '14', overbought: -5, oversold: 120 } }),
    )
    // Clamped levels become an inverted 0/100 pair, so the default pair is restored.
    assert.deepEqual(loadWidgetRsiSettings('panel-a'), {
      period: 14,
      overbought: 70,
      oversold: 30,
    })
  })

  it('falls back to defaults for malformed storage', () => {
    localStorage.setItem(WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY, 'not-json')
    assert.deepEqual(loadWidgetRsiSettings('panel-a'), createDefaultRsiSettings())
  })
})
