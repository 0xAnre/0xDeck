import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import {
  CANDLE_COLORS_STORAGE_KEY,
  CANDLE_PART_IDS,
  DEFAULT_CANDLE_COLORS,
  candleCandlestickSeriesOptions,
  candleColorWithOpacity,
  candleColorsEqual,
  candlePartColor,
  createDefaultCandleColors,
  getCandleColors,
  loadCandleColors,
  resetCandleColors,
  sanitizeCandleColors,
  saveCandleColors,
  setCandleColors,
  subscribeCandleColors,
  type CandleColors,
} from './candleColors.ts'

const memory = new Map<string, string>()

/**
 * The module binds exactly one `storage` listener on the first subscribe. Capture
 * it before any test subscribes so the cross-tab path can be exercised without a
 * browser. Other event types keep Node's own listener registration.
 */
let storageListener: ((event: { key: string | null }) => void) | null = null
const originalAddEventListener = globalThis.addEventListener
globalThis.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  if (type === 'storage' && typeof listener === 'function') {
    storageListener = listener as unknown as (event: { key: string | null }) => void
    return
  }
  originalAddEventListener.call(globalThis, type, listener, options)
}) as typeof globalThis.addEventListener

/** Native options the old single-pair record produced for a custom pair. */
const LEGACY_NATIVE_OPTIONS = {
  upColor: '#123ABC',
  downColor: '#0A0B0C',
  wickUpColor: '#123ABC',
  wickDownColor: '#0A0B0C',
  borderUpColor: '#123ABC',
  borderDownColor: '#0A0B0C',
  borderVisible: false,
  wickVisible: true,
}

function part(colors: CandleColors, id: 'body' | 'border' | 'wick') {
  return colors[id]
}

function withOpacity(colors: CandleColors, id: 'body' | 'border' | 'wick', opacity: number) {
  return { ...colors, [id]: { ...colors[id], opacity } } as CandleColors
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

describe('candle appearance defaults and native options', () => {
  it('uses the three reference parts with the existing default colors and visibility', () => {
    assert.deepEqual(CANDLE_PART_IDS, ['body', 'border', 'wick'])
    assert.deepEqual(DEFAULT_CANDLE_COLORS, {
      body: { visible: true, rising: '#DBDBDB', falling: '#808080', opacity: 100 },
      border: { visible: false, rising: '#DBDBDB', falling: '#808080', opacity: 100 },
      wick: { visible: true, rising: '#DBDBDB', falling: '#808080', opacity: 100 },
    })
    assert.equal(DEFAULT_CANDLE_COLORS.body.rising, BTC_PERPETUAL_CANDLESTICK_COLORS.upColor)
    assert.equal(DEFAULT_CANDLE_COLORS.body.falling, BTC_PERPETUAL_CANDLESTICK_COLORS.downColor)
    assert.equal(CANDLE_COLORS_STORAGE_KEY, '0xdeck-candle-colors')
  })

  it('maps defaults to exactly the old native options plus the independent wick visibility', () => {
    assert.deepEqual(candleCandlestickSeriesOptions(DEFAULT_CANDLE_COLORS), {
      upColor: '#DBDBDB',
      downColor: '#808080',
      wickUpColor: '#DBDBDB',
      wickDownColor: '#808080',
      borderUpColor: '#DBDBDB',
      borderDownColor: '#808080',
      borderVisible: false,
      wickVisible: true,
    })
  })

  it('applies a legacy custom pair to all three parts and keeps the old rendered options', () => {
    const colors = sanitizeCandleColors({ rising: '#123ABC', falling: '#0A0B0C' })
    for (const id of CANDLE_PART_IDS) {
      assert.deepEqual(part(colors, id), {
        visible: id !== 'border',
        rising: '#123ABC',
        falling: '#0A0B0C',
        opacity: 100,
      })
    }
    assert.deepEqual(candleCandlestickSeriesOptions(colors), LEGACY_NATIVE_OPTIONS)
  })

  it('keeps each part independent and native border/wick visibility separately', () => {
    const colors = sanitizeCandleColors({
      body: { visible: true, rising: '#111111', falling: '#222222', opacity: 100 },
      border: { visible: true, rising: '#333333', falling: '#444444', opacity: 100 },
      wick: { visible: false, rising: '#555555', falling: '#666666', opacity: 100 },
    })
    assert.deepEqual(candleCandlestickSeriesOptions(colors), {
      upColor: '#111111',
      downColor: '#222222',
      wickUpColor: '#555555',
      wickDownColor: '#666666',
      borderUpColor: '#333333',
      borderDownColor: '#444444',
      borderVisible: true,
      wickVisible: false,
    })
  })

  it('keeps a 0%-opacity color instead of wiping it, and uses exact hex at 100%', () => {
    assert.equal(candleColorWithOpacity('#a1b2c3', 100), '#A1B2C3')
    assert.equal(candleColorWithOpacity('#A1B2C3', 50), 'rgba(161, 178, 195, 0.5)')
    assert.equal(candleColorWithOpacity('#A1B2C3', 0), 'rgba(161, 178, 195, 0)')
    assert.equal(candleColorWithOpacity('not-a-color', 50), 'transparent')

    const hidden = sanitizeCandleColors({
      body: { visible: false, rising: '#A1B2C3', falling: '#0A0B0C', opacity: 100 },
    })
    assert.equal(
      candleCandlestickSeriesOptions(hidden).upColor,
      'rgba(161, 178, 195, 0)',
    )
    assert.equal(candlePartColor(hidden.body, 'rising'), '#A1B2C3')
    // The chosen color is still stored for the next re-enable.
    assert.equal(hidden.body.rising, '#A1B2C3')
  })
})

describe('defensive candle appearance sanitizing', () => {
  it('normalizes valid per-part hex input and keeps independent values', () => {
    assert.deepEqual(
      sanitizeCandleColors({
        body: { rising: 'abcdef', falling: ' 0A0B0C ', opacity: 40 },
        border: { visible: true, rising: '#123456', falling: '#654321', opacity: 0 },
        wick: { visible: false, rising: '#AABBCC', falling: '#CCBBAA', opacity: 100 },
      }),
      {
        body: { visible: true, rising: '#ABCDEF', falling: '#0A0B0C', opacity: 40 },
        border: { visible: true, rising: '#123456', falling: '#654321', opacity: 0 },
        wick: { visible: false, rising: '#AABBCC', falling: '#CCBBAA', opacity: 100 },
      },
    )
  })

  it('falls back per field without discarding valid legacy or sibling values', () => {
    const colors = sanitizeCandleColors({
      rising: '#111111',
      falling: '#222222',
      body: { rising: 'bad', opacity: 75 },
      border: { falling: 42, visible: 'yes' },
      wick: { opacity: '50', visible: false },
    })
    assert.deepEqual(colors, {
      body: { visible: true, rising: '#111111', falling: '#222222', opacity: 75 },
      border: { visible: false, rising: '#111111', falling: '#222222', opacity: 100 },
      wick: { visible: false, rising: '#111111', falling: '#222222', opacity: 100 },
    })
  })

  it('clamps finite opacity and falls back for non-finite or non-number values', () => {
    const values = [
      { input: Number.NaN, expected: 100 },
      { input: Number.POSITIVE_INFINITY, expected: 100 },
      { input: Number.NEGATIVE_INFINITY, expected: 100 },
      { input: -5, expected: 0 },
      { input: 0, expected: 0 },
      { input: 33.6, expected: 34 },
      { input: 150, expected: 100 },
      { input: '50', expected: 100 },
      { input: null, expected: 100 },
    ]
    for (const { input, expected } of values) {
      const colors = sanitizeCandleColors({ body: { opacity: input } })
      assert.equal(colors.body.opacity, expected, `opacity ${String(input)}`)
    }
  })

  it('falls back to both defaults for unreadable or partially invalid records', () => {
    for (const value of [null, undefined, 42, 'red', [], {}, { rising: null, falling: null }]) {
      assert.deepEqual(sanitizeCandleColors(value), DEFAULT_CANDLE_COLORS)
    }
    assert.deepEqual(
      sanitizeCandleColors({ body: null, border: [], wick: { visible: 1 } }),
      DEFAULT_CANDLE_COLORS,
    )
  })

  it("never mutates the saved record it reads", () => {
    const saved = {
      rising: '#123ABC',
      falling: '#0A0B0C',
      body: { rising: '#445566', opacity: 60 },
    }
    const snapshot = structuredClone(saved)
    sanitizeCandleColors(saved)
    assert.deepEqual(saved, snapshot)
  })
})

describe('whole-record equality', () => {
  it('includes opacity and visibility for every part', () => {
    const base = createDefaultCandleColors()
    assert.equal(candleColorsEqual(base, createDefaultCandleColors()), true)
    assert.equal(candleColorsEqual(base, withOpacity(base, 'body', 99)), false)
    assert.equal(candleColorsEqual(base, withOpacity(base, 'border', 0)), false)
    assert.equal(candleColorsEqual(base, withOpacity(base, 'wick', 50)), false)
    assert.equal(
      candleColorsEqual(base, {
        ...base,
        border: { ...base.border, visible: true },
      }),
      false,
    )
    assert.equal(
      candleColorsEqual(base, {
        ...base,
        wick: { ...base.wick, rising: '#FFFFFF' },
      }),
      false,
    )
  })
})

describe('global candle appearance persistence', () => {
  it('round-trips the whole record under the existing key and legacy field names', () => {
    const colors = sanitizeCandleColors({
      body: { visible: true, rising: '#111111', falling: '#222222', opacity: 60 },
      border: { visible: true, rising: '#333333', falling: '#444444', opacity: 40 },
      wick: { visible: false, rising: '#555555', falling: '#666666', opacity: 0 },
    })
    saveCandleColors(colors)
    assert.deepEqual(loadCandleColors(), colors)

    const raw = JSON.parse(memory.get(CANDLE_COLORS_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >
    assert.deepEqual(Object.keys(raw), ['rising', 'falling', 'body', 'border', 'wick'])
    // Legacy readers only see Body, so its colors stay in the top-level pair.
    assert.equal(raw.rising, colors.body.rising)
    assert.equal(raw.falling, colors.body.falling)
    for (const id of CANDLE_PART_IDS) {
      assert.deepEqual(Object.keys(raw[id] as object), ['visible', 'rising', 'falling', 'opacity'])
      assert.equal((raw[id] as Record<string, unknown>).upColor, undefined)
      assert.equal((raw[id] as Record<string, unknown>).downColor, undefined)
    }
  })

  it('loads a legacy record without rewriting storage and keeps its custom pair everywhere', () => {
    const legacy = JSON.stringify({ rising: '#2563EB', falling: '#0A0B0C' })
    memory.set(CANDLE_COLORS_STORAGE_KEY, legacy)

    const loaded = loadCandleColors()
    assert.equal(part(loaded, 'body').rising, '#2563EB')
    assert.equal(part(loaded, 'border').falling, '#0A0B0C')
    assert.equal(part(loaded, 'wick').opacity, 100)
    assert.equal(memory.get(CANDLE_COLORS_STORAGE_KEY), legacy)
  })

  it('does not write defaults when the record is missing or broken', () => {
    memory.delete(CANDLE_COLORS_STORAGE_KEY)
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)
    assert.equal(memory.has(CANDLE_COLORS_STORAGE_KEY), false)

    memory.set(CANDLE_COLORS_STORAGE_KEY, '{not json')
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)
    assert.equal(memory.get(CANDLE_COLORS_STORAGE_KEY), '{not json')
  })

  it('persists sequential whole-record saves without clobbering untouched parts', () => {
    const first = sanitizeCandleColors({
      body: { rising: '#111111', falling: '#222222', opacity: 60 },
      border: { visible: true, rising: '#333333', falling: '#444444', opacity: 40 },
      wick: { rising: '#555555', falling: '#666666', opacity: 25 },
    })
    saveCandleColors(first)

    const second = withOpacity(loadCandleColors(), 'body', 80)
    saveCandleColors(second)
    const reloaded = loadCandleColors()
    assert.deepEqual(reloaded, second)
    assert.deepEqual(reloaded.border, first.border)
    assert.deepEqual(reloaded.wick, first.wick)
    assert.equal(reloaded.body.rising, '#111111')
  })

  it('notifies and rewrites storage for an opacity-only change', () => {
    let notifications = 0
    const unsubscribe = subscribeCandleColors(() => {
      notifications += 1
    })

    memory.set('0xdeck-theme', 'black')
    const before = loadCandleColors()
    const next = withOpacity(before, 'body', 35)
    const saved = setCandleColors(next)
    assert.deepEqual(getCandleColors(), saved)
    assert.equal(notifications, 1)
    assert.equal(part(loadCandleColors(), 'body').opacity, 35)
    // Saving only re-writes this global key; unrelated preferences stay untouched.
    assert.equal(memory.get('0xdeck-theme'), 'black')

    unsubscribe()
  })

  it("adopts another tab's whole-record change even when only opacity differs", () => {
    let notifications = 0
    const unsubscribe = subscribeCandleColors(() => {
      notifications += 1
    })
    assert.notEqual(storageListener, null)

    const base = getCandleColors()
    const external = withOpacity(base, 'wick', 45)
    memory.set(CANDLE_COLORS_STORAGE_KEY, JSON.stringify(external))
    storageListener?.({ key: CANDLE_COLORS_STORAGE_KEY })

    assert.equal(part(getCandleColors(), 'wick').opacity, 45)
    assert.equal(notifications, 1)

    // An equal record and an unrelated key never notify.
    storageListener?.({ key: CANDLE_COLORS_STORAGE_KEY })
    storageListener?.({ key: '0xdeck-other' })
    assert.equal(notifications, 1)

    unsubscribe()
  })

  it('still works in memory when localStorage is unavailable', () => {
    // @ts-expect-error simulate a host without localStorage
    delete globalThis.localStorage
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)
    const saved = setCandleColors(
      sanitizeCandleColors({ body: { opacity: 20, rising: '#123456' } }),
    )
    assert.deepEqual(getCandleColors(), saved)
  })
})

describe('draft-safe defaults and reset', () => {
  it('returns a deep copy that cannot mutate the shared default record', () => {
    const first = createDefaultCandleColors()
    const second = createDefaultCandleColors()
    assert.notEqual(first, second)
    assert.notEqual(first.body, second.body)

    const mutable = first as unknown as {
      body: { rising: string; opacity: number }
    }
    mutable.body.rising = '#000000'
    mutable.body.opacity = 0
    assert.equal(second.body.rising, '#DBDBDB')
    assert.equal(second.body.opacity, 100)
    assert.equal(DEFAULT_CANDLE_COLORS.body.rising, '#DBDBDB')
  })

  it('resets the stored preference to the built-in whole record', () => {
    setCandleColors(
      sanitizeCandleColors({
        body: { rising: '#111111', opacity: 20 },
        border: { visible: true },
      }),
    )
    const reset = resetCandleColors()
    assert.deepEqual(reset, DEFAULT_CANDLE_COLORS)
    assert.deepEqual(getCandleColors(), DEFAULT_CANDLE_COLORS)
    assert.deepEqual(loadCandleColors(), DEFAULT_CANDLE_COLORS)
  })
})
