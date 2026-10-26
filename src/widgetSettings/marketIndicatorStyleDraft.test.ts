import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isMarketIndicatorStyleDraftPatchEmpty,
  marketIndicatorStyleDraftFromInputs,
  marketIndicatorStyleDraftPatch,
  sanitizeMarketIndicatorStyleDraft,
  type MarketIndicatorStyleDraft,
} from './marketIndicatorStyleDraft.ts'
import { DEFAULT_RSI_OVERBOUGHT, DEFAULT_RSI_OVERSOLD, DEFAULT_RSI_PERIOD } from '../market/rsi.ts'
import { DEFAULT_ORDER_BOOK_DEPTH_SETTINGS } from '../market/orderBookDepthSettings.ts'

function baseDraft(
  overrides: Partial<MarketIndicatorStyleDraft> = {},
): MarketIndicatorStyleDraft {
  return marketIndicatorStyleDraftFromInputs({
    color: '#CCCCCC',
    opacityPercent: 100,
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#A3A3A3',
    fillOpacityPercent: 25,
    rsiSettings: null,
    ...overrides,
  })
}

function rsiDraft(overrides: Partial<MarketIndicatorStyleDraft> = {}) {
  return marketIndicatorStyleDraftFromInputs({
    color: '#CCCCCC',
    opacityPercent: 100,
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#A3A3A3',
    fillOpacityPercent: 25,
    rsiSettings: {
      period: DEFAULT_RSI_PERIOD,
      overbought: DEFAULT_RSI_OVERBOUGHT,
      oversold: DEFAULT_RSI_OVERSOLD,
    },
    ...overrides,
  })
}

describe('marketIndicatorStyleDraftFromInputs', () => {
  it('keeps the resolved input values and drops absent RSI settings', () => {
    const draft = baseDraft()
    assert.equal(draft.rsi, null)
    assert.equal(draft.color, '#CCCCCC')
    assert.equal(draft.lineStyle, 'solid')
  })

  it('sanitizes provided RSI settings into the draft', () => {
    const draft = marketIndicatorStyleDraftFromInputs({
      color: '#CCCCCC',
      opacityPercent: 100,
      lineWidth: 2,
      lineStyle: 'dotted',
      fillColor: '#A3A3A3',
      fillOpacityPercent: 25,
      rsiSettings: { period: 0, overbought: 500, oversold: -20 },
    })
    assert.deepEqual(draft.rsi, { period: 2, overbought: 100, oversold: 0 })
  })
})

describe('marketIndicatorStyleDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = baseDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, { ...initial })
    assert.deepEqual(patch, { presentation: {}, rsi: null, orderBookDepth: null })
    assert.equal(isMarketIndicatorStyleDraftPatchEmpty(patch), true)
  })

  it('commits only the changed presentation field', () => {
    const initial = baseDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      opacityPercent: 45,
    })
    assert.deepEqual(patch, { presentation: { opacity: 45 }, rsi: null, orderBookDepth: null })
  })

  it('commits color, width and Line/Dot independently', () => {
    const initial = baseDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      color: '#123456',
      lineWidth: 4,
      lineStyle: 'dotted',
    })
    assert.deepEqual(patch, {
      presentation: { color: '#123456', lineWidth: 4, lineStyle: 'dotted' },
      rsi: null,
      orderBookDepth: null,
    })
  })

  it('commits background fill independently from line styling', () => {
    const initial = baseDraft()
    const fillOnly = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      fillColor: '#123456',
      fillOpacityPercent: 60,
    })
    assert.deepEqual(fillOnly, {
      presentation: { fillColor: '#123456', fillOpacity: 60 },
      rsi: null,
      orderBookDepth: null,
    })

    const lineOnly = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      color: '#000000',
      opacityPercent: 40,
      lineWidth: 3,
      lineStyle: 'dotted',
    })
    assert.deepEqual(lineOnly, {
      presentation: { color: '#000000', opacity: 40, lineWidth: 3, lineStyle: 'dotted' },
      rsi: null,
      orderBookDepth: null,
    })
    assert.equal(lineOnly.presentation.fillColor, undefined)
    assert.equal(lineOnly.presentation.fillOpacity, undefined)
  })

  it('keeps RSI unchanged when the typed values sanitize back to the stored range', () => {
    const initial = rsiDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, { ...initial })
    assert.equal(patch.rsi, null)
    assert.equal(isMarketIndicatorStyleDraftPatchEmpty(patch), true)
  })

  it('commits the sanitized RSI range when it changed', () => {
    const initial = rsiDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      rsi: { period: 21, overbought: 80, oversold: 20 },
    })
    assert.deepEqual(patch.rsi, { period: 21, overbought: 80, oversold: 20 })
    assert.deepEqual(patch.presentation, {})
  })

  it('sanitizes an out-of-range RSI draft on commit without clamping mid-typing', () => {
    const initial = rsiDraft()
    const typed = { ...initial, rsi: { period: 500, overbought: 120, oversold: -1 } }
    // Mid-typing the draft keeps the raw numbers.
    assert.deepEqual(typed.rsi, { period: 500, overbought: 120, oversold: -1 })
    // Only blur/Enter/Save sanitizes, and it rewrites the draft, not storage.
    const sanitized = sanitizeMarketIndicatorStyleDraft(initial, typed)
    assert.deepEqual(sanitized.rsi, { period: 200, overbought: 100, oversold: 0 })
    assert.deepEqual(marketIndicatorStyleDraftPatch(initial, sanitized).rsi, {
      period: 200,
      overbought: 100,
      oversold: 0,
    })
  })

  it('discarding an edited draft produces no commit', () => {
    const initial = rsiDraft()
    const edited = {
      ...initial,
      color: '#000000',
      fillColor: '#000000',
      fillOpacityPercent: 0,
      rsi: { period: 30, overbought: 75, oversold: 25 },
    }
    assert.deepEqual(marketIndicatorStyleDraftPatch(initial, initial), {
      presentation: {},
      rsi: null,
      orderBookDepth: null,
    })
    assert.notDeepEqual(edited, initial)
  })
})

describe('Order Book Depth settings in the shared indicator draft', () => {
  function orderBookDraft() {
    return marketIndicatorStyleDraftFromInputs({
      color: '#CCCCCC',
      opacityPercent: 100,
      lineWidth: 1,
      lineStyle: 'solid',
      fillColor: '#A3A3A3',
      fillOpacityPercent: 25,
      rsiSettings: null,
      orderBookDepthSettings: DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    })
  }

  it('keeps the settings out of the patch while unchanged', () => {
    const initial = orderBookDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, { ...initial })
    assert.equal(patch.orderBookDepth, null)
    assert.equal(isMarketIndicatorStyleDraftPatchEmpty(patch), true)
  })

  it('commits only changed Order Book Depth fields with the presentation patch', () => {
    const initial = orderBookDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      orderBookDepth: {
        ...DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
        distance: 0.25,
        positiveThreshold: 60,
      },
    })
    assert.deepEqual(patch.orderBookDepth, {
      ...DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
      distance: 0.25,
      positiveThreshold: 60,
    })
    assert.deepEqual(patch.presentation, {})
    assert.equal(patch.rsi, null)
  })

  it('sanitizes an edited Order Book Depth draft on commit', () => {
    const initial = orderBookDraft()
    const sanitized = sanitizeMarketIndicatorStyleDraft(initial, {
      ...initial,
      orderBookDepth: {
        source: 'hyperliquid' as never,
        distance: 9 as never,
        positiveThreshold: 500,
        negativeThreshold: -500,
      },
    })
    assert.deepEqual(
      sanitized.orderBookDepth,
      DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    )
  })
})

describe('sanitizeMarketIndicatorStyleDraft', () => {
  it('falls back to opened values for invalid presentation fields', () => {
    const initial = baseDraft()
    assert.deepEqual(
      sanitizeMarketIndicatorStyleDraft(initial, {
        ...initial,
        color: 'rgb(1,2,3)',
        opacityPercent: 300,
        lineWidth: 9 as never,
        lineStyle: 'dashed' as never,
        fillColor: '#12345',
        fillOpacityPercent: -1,
      }),
      initial,
    )
  })

  it('accepts boundary background opacities', () => {
    const initial = baseDraft()
    assert.deepEqual(
      sanitizeMarketIndicatorStyleDraft(initial, {
        ...initial,
        fillColor: '#000000',
        fillOpacityPercent: 0,
      }),
      { ...initial, fillColor: '#000000', fillOpacityPercent: 0 },
    )
    assert.deepEqual(
      sanitizeMarketIndicatorStyleDraft(initial, {
        ...initial,
        fillOpacityPercent: 100,
      }),
      { ...initial, fillOpacityPercent: 100 },
    )
  })
})
