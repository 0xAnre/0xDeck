import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketIndicatorPresentation,
  saveWidgetMarketIndicatorPresentation,
  WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
} from '../marketIndicatorPresentationStorage.ts'

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

describe('market indicator presentation opacity', () => {
  it('round-trips an independent opacity without touching stored colors', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'triple-ema', {
      color: '#112233',
      opacity: 40,
      lineWidth: 2,
      lineStyle: 'dotted',
    })
    const loaded = loadWidgetMarketIndicatorPresentation('panel-a', 'triple-ema')
    assert.deepEqual(loaded, {
      color: '#112233',
      opacity: 40,
      lineWidth: 2,
      lineStyle: 'dotted',
    })
    assert.ok(memory.has(WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY))
  })

  it('preserves a custom color when only its opacity changes', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap', { color: '#abcdef' })
    saveWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap', {
      ...loadWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap'),
      opacity: 25,
    })
    const loaded = loadWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap')
    assert.equal(loaded.color, '#abcdef')
    assert.equal(loaded.opacity, 25)
  })

  it('loads legacy payloads without opacity and keeps their other fields', () => {
    memory.set(
      WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          'dual-ema': { color: '#445566', lineWidth: 3 },
        },
      }),
    )
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'dual-ema'), {
      color: '#445566',
      lineWidth: 3,
    })
  })

  it('migrates a persisted dashed line style to solid and keeps the rest', () => {
    memory.set(
      WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          'triple-ema': { color: '#112233', opacity: 60, lineWidth: 4, lineStyle: 'dashed' },
        },
      }),
    )
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'triple-ema'), {
      color: '#112233',
      opacity: 60,
      lineWidth: 4,
      lineStyle: 'solid',
    })
  })

  it('drops invalid opacity values instead of persisting them', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'triple-ema', {
      opacity: 250,
      lineWidth: 2,
    })
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'triple-ema'), {
      lineWidth: 2,
    })
  })
})
