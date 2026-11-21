import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import {
  CANDLE_COLORS_STORAGE_KEY,
  DEFAULT_CANDLE_COLORS,
  candleCandlestickSeriesOptions,
  candleColorsEqual,
  getCandleColors,
  loadCandleColors,
  resetCandleColors,
  sanitizeCandleColors,
  saveCandleColors,
  setCandleColors,
  subscribeCandleColors,
} from './candleColors.ts'

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
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
  } as Storage
  setCandleColors(DEFAULT_CANDLE_COLORS)
})

describe('candle color defaults and series mapping', () => {
  it('keeps the existing rising/falling defaults', () => {
    assert.deepEqual(DEFAULT_CANDLE_COLORS, { rising: '#DBDBDB', falling: '#808080' })
    assert.equal(DEFAULT_CANDLE_COLORS.rising, BTC_PERPETUAL_CANDLESTICK_COLORS.upColor)
    assert.equal(DEFAULT_CANDLE_COLORS.falling, BTC_PERPETUAL_CANDLESTICK_COLORS.downColor)
  })

  it('maps one direction color to body, wick and border and never shows the border', () => {
    assert.deepEqual(candleCandlestickSeriesOptions({ rising: '#123ABC', falling: '#0A0B0C' }), {
      upColor: '#123ABC',
      downColor: '#0A0B0C',
      wickUpColor: '#123ABC',
      wickDownColor: '#0A0B0C',
      borderUpColor: '#123ABC',
      borderDownColor: '#0A0B0C',
      borderVisible: false,
    })
  })
})

describe('defensive candle color sanitizing', () => {
  it('normalizes valid hex input per direction', () => {
    assert.deepEqual(sanitizeCandleColors({ rising: 'abcdef', falling: ' 0A0B0C ' }), {
      rising: '#ABCDEF',
      falling: '#0A0B0C',
    })
  })

  it('falls back per field instead of discarding a valid sibling', () => {
    assert.deepEqual(sanitizeCandleColors({ rising: 'not-a-color', falling: '#112233' }), {
      rising: '#DBDBDB',
      falling: '#112233',
    })
    assert.deepEqual(sanitizeCandleColors({ rising: '#445566', falling: 42 }), {
      rising: '#445566',
      falling: '#808080',
    })
  })

  it('falls back to both defaults for unreadable records', () => {
    for (const value of [null, undefined, 42, 'red', [], {}, { rising: null, falling: null }]) {
      assert.deepEqual(sanitizeCandleColors(value), DEFAULT_CANDLE_COLORS)
    }
  })
})

describe('global candle color persistence', () => {
  it('round-trips the record and defaults on broken or missing storage', () => {
    const colors = { rising: '#123ABC', falling: '#0A0B0C' }
    saveCandleColors(colors)
    assert.deepEqual(loadCandleColors(), colors)

    memory.set(CANDLE_COLORS_STORAGE_KEY, '{not json')
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)

    memory.delete(CANDLE_COLORS_STORAGE_KEY)
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)
  })

  it('persists on set, notifies subscribers and resets to the built-in pair', () => {
    let notifications = 0
    const unsubscribe = subscribeCandleColors(() => {
      notifications += 1
    })
    const next = setCandleColors({ rising: '#ABCDEF', falling: '#112233' })
    assert.deepEqual(getCandleColors(), next)
    assert.equal(notifications, 1)
    assert.equal(
      memory.get(CANDLE_COLORS_STORAGE_KEY),
      JSON.stringify({ rising: '#ABCDEF', falling: '#112233' }),
    )

    resetCandleColors()
    assert.deepEqual(getCandleColors(), DEFAULT_CANDLE_COLORS)
    assert.equal(notifications, 2)
    assert.equal(candleColorsEqual(getCandleColors(), DEFAULT_CANDLE_COLORS), true)
    unsubscribe()
  })

  it('still works in memory when localStorage is unavailable', () => {
    // @ts-expect-error simulate a host without localStorage
    delete globalThis.localStorage
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)
    const saved = setCandleColors({ rising: '#ABCDEF', falling: '#112233' })
    assert.deepEqual(getCandleColors(), saved)
  })
})
