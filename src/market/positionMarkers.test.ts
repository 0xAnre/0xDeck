import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  loadWidgetMarketPositionMarkerSettings,
  saveWidgetMarketPositionMarkerSettings,
  WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
} from '../marketPositionMarkersStorage.ts'
import {
  DEFAULT_POSITION_MARKER_SETTINGS,
  isPositionMarkersMenuVisible,
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
  POSITION_MARKER_SIZE_DEFAULT,
  POSITION_MARKER_SIZE_MAX,
  POSITION_MARKER_SIZE_MIN,
  POSITION_MARKER_SIZE_STEP,
  positionMarkerSizeFieldIds,
  positionMarkerSizeLabel,
  sanitizePositionMarkerSettings,
  sanitizePositionMarkerSize,
  shouldShowPositionMarkers,
} from './positionMarkers.ts'

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

function storedMap(): Record<string, unknown> {
  const raw = memory.get(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY)
  assert.ok(raw, 'expected a stored Position Markers record')
  return JSON.parse(raw) as Record<string, unknown>
}

describe('Position Markers size bounds', () => {
  it('declares the agreed range, step and default', () => {
    assert.equal(POSITION_MARKER_SIZE_MIN, 0.5)
    assert.equal(POSITION_MARKER_SIZE_MAX, 3)
    assert.equal(POSITION_MARKER_SIZE_STEP, 0.25)
    assert.equal(POSITION_MARKER_SIZE_DEFAULT, 1.25)
    // #241's fixed 1.5 multiplier is no longer the default.
    assert.notEqual(POSITION_MARKER_SIZE_DEFAULT, 1.5)
    assert.deepEqual(DEFAULT_POSITION_MARKER_SETTINGS, { enabled: false, size: 1.25 })
  })

  it('clamps values outside the range to the nearest bound', () => {
    assert.equal(sanitizePositionMarkerSize(0), 0.5)
    assert.equal(sanitizePositionMarkerSize(0.1), 0.5)
    assert.equal(sanitizePositionMarkerSize(-5), 0.5)
    assert.equal(sanitizePositionMarkerSize(3.1), 3)
    assert.equal(sanitizePositionMarkerSize(10), 3)
    assert.equal(sanitizePositionMarkerSize(Number.MAX_SAFE_INTEGER), 3)
  })

  it('rounds in-range values to the 0.25 step', () => {
    assert.equal(sanitizePositionMarkerSize(0.62), 0.5)
    assert.equal(sanitizePositionMarkerSize(0.74), 0.75)
    assert.equal(sanitizePositionMarkerSize(1.13), 1.25)
    assert.equal(sanitizePositionMarkerSize(1.3), 1.25)
    assert.equal(sanitizePositionMarkerSize(1.4), 1.5)
    assert.equal(sanitizePositionMarkerSize(2.9), 3)
  })

  it('keeps step-aligned values untouched', () => {
    for (let size = POSITION_MARKER_SIZE_MIN; size <= POSITION_MARKER_SIZE_MAX; size += 0.25) {
      assert.equal(sanitizePositionMarkerSize(size), size)
    }
  })

  it('falls back to the default for non-numeric input', () => {
    for (const value of [
      undefined,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '2',
      '1.25×',
      {},
      [],
      true,
    ]) {
      assert.equal(sanitizePositionMarkerSize(value), 1.25)
    }
  })

  it('formats the slider readout as a multiple of the default', () => {
    assert.equal(positionMarkerSizeLabel(1.25), '1.25×')
    assert.equal(positionMarkerSizeLabel(0.5), '0.5×')
    assert.equal(positionMarkerSizeLabel(1), '1×')
    assert.equal(positionMarkerSizeLabel(3), '3×')
    assert.equal(positionMarkerSizeLabel('nope'), '1.25×')
  })
})

describe('Position Markers settings record', () => {
  it('migrates a legacy boolean to enabled + default size', () => {
    assert.deepEqual(sanitizePositionMarkerSettings(true), { enabled: true, size: 1.25 })
    assert.deepEqual(sanitizePositionMarkerSettings(false), { enabled: false, size: 1.25 })
  })

  it('sanitizes the object form and keeps a valid size', () => {
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true, size: 2 }), {
      enabled: true,
      size: 2,
    })
    // Clamped, then stepped.
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true, size: 99 }), {
      enabled: true,
      size: 3,
    })
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true, size: 1.3 }), {
      enabled: true,
      size: 1.25,
    })
    // A missing/invalid size falls back to the default, not to OFF.
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: true }), {
      enabled: true,
      size: 1.25,
    })
  })

  it('treats anything unreadable as OFF at the default size', () => {
    for (const value of [undefined, null, 1, 'yes', [], {}]) {
      assert.deepEqual(sanitizePositionMarkerSettings(value), {
        enabled: false,
        size: 1.25,
      })
    }
    assert.deepEqual(sanitizePositionMarkerSettings({ enabled: 'true', size: '2' }), {
      enabled: false,
      size: 1.25,
    })
  })
})

describe('Position Markers storage', () => {
  it('defaults to OFF at the default size when unset', () => {
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 1.25,
    })
  })

  it('round-trips toggle and size per widget without leaking across panels', () => {
    saveWidgetMarketPositionMarkerSettings('panel-a', { enabled: true, size: 2 })
    saveWidgetMarketPositionMarkerSettings('panel-b', { enabled: false, size: 0.75 })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: true,
      size: 2,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-b'), {
      enabled: false,
      size: 0.75,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-c'), {
      enabled: false,
      size: 1.25,
    })

    saveWidgetMarketPositionMarkerSettings('panel-a', { enabled: false, size: 3 })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 3,
    })
  })

  it('keeps the same storage key and migrates a stored legacy boolean', () => {
    assert.equal(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY, '0xdeck-widget-market-position-markers')
    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': true, 'panel-b': false }),
    )
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: true,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-b'), {
      enabled: false,
      size: 1.25,
    })
  })

  it('rewrites migrated entries in the object shape on the next save', () => {
    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({ 'panel-a': true }),
    )
    saveWidgetMarketPositionMarkerSettings('panel-b', { enabled: true, size: 1.75 })

    assert.deepEqual(storedMap(), {
      'panel-a': { enabled: true, size: 1.25 },
      'panel-b': { enabled: true, size: 1.75 },
    })
  })

  it('sanitizes on write and ignores invalid and corrupt stored values', () => {
    saveWidgetMarketPositionMarkerSettings('panel-a', { enabled: true, size: 4 })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: true,
      size: 3,
    })
    assert.deepEqual(storedMap(), { 'panel-a': { enabled: true, size: 3 } })

    memory.set(
      WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
      JSON.stringify({
        'panel-a': 'yes',
        'panel-b': 1,
        'panel-c': true,
        'panel-d': { enabled: true, size: '2' },
      }),
    )
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-b'), {
      enabled: false,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-c'), {
      enabled: true,
      size: 1.25,
    })
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-d'), {
      enabled: true,
      size: 1.25,
    })

    memory.set(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY, '{not-json')
    assert.deepEqual(loadWidgetMarketPositionMarkerSettings('panel-a'), {
      enabled: false,
      size: 1.25,
    })
  })
})

describe('Position Markers meaning', () => {
  it('defines fixed marker colors for every theme', () => {
    assert.equal(POSITION_MARKER_BUY_COLOR, '#22C55E')
    assert.equal(POSITION_MARKER_SELL_COLOR, '#EF4444')
  })

  it('is visible and active only for Hyperliquid when enabled', () => {
    assert.equal(isPositionMarkersMenuVisible('hyperliquid'), true)
    assert.equal(isPositionMarkersMenuVisible('binance'), false)

    assert.equal(shouldShowPositionMarkers('hyperliquid', true), true)
    assert.equal(shouldShowPositionMarkers('hyperliquid', false), false)
    assert.equal(shouldShowPositionMarkers('binance', true), false)
    assert.equal(shouldShowPositionMarkers('binance', false), false)
  })
})

describe('Position Markers dialog field ids', () => {
  it('derives the label and slider ids from the panel id', () => {
    assert.deepEqual(positionMarkerSizeFieldIds('btc-perpetual-chart-e2e'), {
      labelId: 'btc-perpetual-chart-e2e-position-marker-size-label',
      sliderId: 'btc-perpetual-chart-e2e-position-marker-size',
    })
  })

  it('never shares ids between two panels', () => {
    const first = positionMarkerSizeFieldIds('btc-perpetual-chart-aaa111')
    const second = positionMarkerSizeFieldIds('btc-perpetual-chart-bbb222')

    assert.notEqual(first.sliderId, second.sliderId)
    assert.notEqual(first.labelId, second.labelId)
    // `htmlFor`/`aria-labelledby` must never resolve to the slider itself.
    assert.notEqual(first.labelId, first.sliderId)
  })
})

/**
 * Static wiring guard for the two silent regressions a review proved with all
 * gates green (#242 follow-up, finding F2):
 *
 * - `hyperliquidFillGroupsToMarkers(...)` called without the stored size →
 *   lint clean, every `node:test` green, the slider is simply inert;
 * - `positionMarkerSettings.size` dropped from the markers effect dependency
 *   array → only an `eslint` warning, so `npm run lint` still exits 0 and the
 *   chart keeps the old arrow size until something else repaints it.
 *
 * Storage and the chart live in different modules, so no unit test can see the
 * omission; the panel source is the only place the two are joined. These
 * assertions fail on the mutation instead of trusting the type checker.
 */
const PANEL_SOURCE_PATH = path.resolve(
  import.meta.dirname,
  '../BtcPerpetualChartPanel.tsx',
)

const MARKER_MAPPING_CALL = 'hyperliquidFillGroupsToMarkers('

/** Index of the bracket that closes the one at `start`, ignoring quoted text. */
function matchingBracketIndex(
  source: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0
  let quote: string | null = null

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (quote !== null) {
      if (character === '\\') index += 1
      else if (character === quote) quote = null
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
    } else if (character === open) {
      depth += 1
    } else if (character === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/** Splits a call/array body on the commas that are not nested in brackets. */
function splitTopLevelEntries(body: string): string[] {
  const entries: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]

    if (quote !== null) {
      current += character
      if (character === '\\') {
        index += 1
        current += body[index] ?? ''
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
    } else if (character === '(' || character === '[' || character === '{') {
      depth += 1
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1
    }

    if (character === ',' && depth === 0) {
      entries.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  const last = current.trim()
  if (last !== '') entries.push(last)
  return entries
}

/** Top-level arguments of the first `name(...)` call in `source`. */
function callArguments(source: string, name: string): string[] {
  const start = source.indexOf(name)
  assert.notEqual(start, -1, `${name} is not called in the panel source`)

  const open = source.indexOf('(', start + name.length - 1)
  assert.notEqual(open, -1, `unterminated ${name} call`)

  const close = matchingBracketIndex(source, open, '(', ')')
  assert.notEqual(close, -1, `unterminated ${name} argument list`)

  return splitTopLevelEntries(source.slice(open + 1, close))
}

/** Dependency array of the effect that owns the mapping call at `callIndex`. */
function effectDependencies(source: string, callIndex: number): string[] {
  const bodyEnd = source.indexOf('}, [', callIndex)
  assert.notEqual(
    bodyEnd,
    -1,
    'the markers effect that maps fills has no dependency array',
  )

  const open = source.indexOf('[', bodyEnd)
  assert.notEqual(open, -1, 'the markers effect dependency array is empty or malformed')

  const close = matchingBracketIndex(source, open, '[', ']')
  assert.notEqual(close, -1, 'unterminated markers effect dependency array')

  return splitTopLevelEntries(source.slice(open + 1, close))
}

describe('Position Markers chart wiring', () => {
  const panelSource = readFileSync(PANEL_SOURCE_PATH, 'utf8')

  it('passes the stored size into the marker mapping', () => {
    const args = callArguments(panelSource, MARKER_MAPPING_CALL)

    assert.equal(
      args.length,
      3,
      `hyperliquidFillGroupsToMarkers must receive (groups, colors, size): ${args.join(' | ')}`,
    )
    assert.equal(args.at(-1), 'positionMarkerSettings.size')
  })

  it('repaints the markers when the stored size changes', () => {
    const callIndex = panelSource.indexOf(MARKER_MAPPING_CALL)
    const dependencies = effectDependencies(panelSource, callIndex)

    assert.ok(
      dependencies.includes('positionMarkerSettings.size'),
      `markers effect must depend on positionMarkerSettings.size: ${dependencies.join(', ')}`,
    )
  })

  it('detects both proven mutations instead of passing silently', () => {
    // Mutation D: the size argument is dropped from the mapping call.
    const withoutSizeArgument = `
      markers.setMarkers(
        hyperliquidFillGroupsToMarkers(
          groupHyperliquidFillMarkers(visible),
          HYPERLIQUID_MARKER_COLORS,
        ),
      )
      accountMarkersByBucketRef.current = byBucket
    }, [
      accountFills,
      positionMarkerSettings.size,
      positionMarkersEnabled,
    ])
    `
    const mutatedArgs = callArguments(withoutSizeArgument, MARKER_MAPPING_CALL)
    assert.notEqual(mutatedArgs.at(-1), 'positionMarkerSettings.size')
    assert.equal(mutatedArgs.length, 2)

    // Mutation E: the size is dropped from the effect dependency array.
    const withoutSizeDependency = withoutSizeArgument.replace(
      /\n\s+positionMarkerSettings\.size,/,
      '',
    )
    const mutatedDependencies = effectDependencies(
      withoutSizeDependency,
      withoutSizeDependency.indexOf(MARKER_MAPPING_CALL),
    )
    assert.ok(!mutatedDependencies.includes('positionMarkerSettings.size'))
  })
})
