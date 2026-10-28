import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketIndicatorPresentation,
  mergeMarketIndicatorSeriesStyles,
  sanitizeMarketIndicatorPresentation,
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

describe('market indicator presentation band fill', () => {
  it('round-trips independent fill color and opacity per panel and indicator', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap', {
      color: '#112233',
      opacity: 80,
      fillColor: '#445566',
      fillOpacity: 40,
    })
    saveWidgetMarketIndicatorPresentation('panel-b', 'daily-vwap', {
      fillColor: '#778899',
      fillOpacity: 0,
    })

    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap'), {
      color: '#112233',
      opacity: 80,
      fillColor: '#445566',
      fillOpacity: 40,
    })
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-b', 'daily-vwap'), {
      fillColor: '#778899',
      fillOpacity: 0,
    })
  })

  it('preserves fill fields when only line styling is changed', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'weekly-vwap', {
      fillColor: '#445566',
      fillOpacity: 40,
    })
    saveWidgetMarketIndicatorPresentation('panel-a', 'weekly-vwap', {
      ...loadWidgetMarketIndicatorPresentation('panel-a', 'weekly-vwap'),
      lineWidth: 3,
    })
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'weekly-vwap'), {
      fillColor: '#445566',
      fillOpacity: 40,
      lineWidth: 3,
    })
  })

  it('loads legacy records without fill fields and leaves the fill default to the caller', () => {
    memory.set(
      WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          'monthly-vwap': { color: '#445566', opacity: 60, lineWidth: 2 },
        },
      }),
    )
    const loaded = loadWidgetMarketIndicatorPresentation('panel-a', 'monthly-vwap')
    assert.deepEqual(loaded, { color: '#445566', opacity: 60, lineWidth: 2 })
    assert.equal(loaded.fillColor, undefined)
    assert.equal(loaded.fillOpacity, undefined)
  })

  it('drops invalid fill values instead of persisting them', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'yearly-vwap', {
      fillColor: 'rgba(1, 2, 3, 0.5)' as never,
      fillOpacity: 250,
      lineWidth: 2,
    })
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'yearly-vwap'), {
      lineWidth: 2,
    })
  })
})


describe('market indicator presentation per-series line styles', () => {
  it('round-trips independent center/upper/lower styles field by field', () => {
    saveWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap', {
      color: '#111111',
      opacity: 80,
      lineWidth: 2,
      lineStyle: 'solid',
      series: {
        vwap: { color: '#222222', opacity: 100, lineWidth: 4, lineStyle: 'dotted' },
        previousUpper1: { opacity: 0 },
        previousLower1: { color: '#333333', lineWidth: 3 },
      },
      fillColor: '#444444',
      fillOpacity: 10,
    })
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'daily-vwap'), {
      color: '#111111',
      opacity: 80,
      lineWidth: 2,
      lineStyle: 'solid',
      series: {
        vwap: { color: '#222222', opacity: 100, lineWidth: 4, lineStyle: 'dotted' },
        previousUpper1: { opacity: 0 },
        previousLower1: { color: '#333333', lineWidth: 3 },
      },
      fillColor: '#444444',
      fillOpacity: 10,
    })
  })

  it('loads legacy flat records unchanged and leaves series unset', () => {
    memory.set(
      WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          'weekly-vwap': { color: '#445566', opacity: 60, lineWidth: 2, lineStyle: 'dotted' },
        },
      }),
    )
    const loaded = loadWidgetMarketIndicatorPresentation('panel-a', 'weekly-vwap')
    assert.deepEqual(loaded, {
      color: '#445566',
      opacity: 60,
      lineWidth: 2,
      lineStyle: 'dotted',
    })
    assert.equal(loaded.series, undefined)
  })

  it('drops invalid per-series fields while keeping the valid ones', () => {
    memory.set(
      WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
      JSON.stringify({
        'panel-a': {
          'yearly-vwap': {
            series: {
              vwap: { color: 'red', opacity: 250, lineWidth: 9, lineStyle: 'dashed' },
              previousUpper1: { color: '#aabbcc', opacity: 0 },
              previousLower1: { color: '#12345' },
              unknown: { color: '#ffffff' },
            },
          },
        },
      }),
    )
    assert.deepEqual(loadWidgetMarketIndicatorPresentation('panel-a', 'yearly-vwap'), {
      series: {
        vwap: { lineStyle: 'solid' },
        previousUpper1: { color: '#aabbcc', opacity: 0 },
      },
    })
  })

  it('sanitizes empty and malformed series records away', () => {
    assert.deepEqual(sanitizeMarketIndicatorPresentation({ series: {} }), {})
    assert.deepEqual(sanitizeMarketIndicatorPresentation({ series: null }), {})
    assert.deepEqual(sanitizeMarketIndicatorPresentation({ series: { vwap: {} } }), {})
    assert.deepEqual(sanitizeMarketIndicatorPresentation('bad'), null)
  })

  it('merges changed per-series fields without dropping the others', () => {
    assert.deepEqual(
      mergeMarketIndicatorSeriesStyles(
        {
          vwap: { color: '#111111', lineWidth: 2 },
          previousUpper1: { opacity: 40 },
        },
        {
          vwap: { lineWidth: 4 },
          previousLower1: { lineStyle: 'dotted' },
        },
      ),
      {
        vwap: { color: '#111111', lineWidth: 4 },
        previousUpper1: { opacity: 40 },
        previousLower1: { lineStyle: 'dotted' },
      },
    )
    assert.equal(mergeMarketIndicatorSeriesStyles(undefined, undefined), undefined)
  })
})
