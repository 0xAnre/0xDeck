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

function baseDraft(
  overrides: Partial<MarketIndicatorStyleDraft> = {},
): MarketIndicatorStyleDraft {
  return marketIndicatorStyleDraftFromInputs({
    color: '#CCCCCC',
    opacityPercent: 100,
    lineWidth: 1,
    lineStyle: 'solid',
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
      rsiSettings: { period: 0, overbought: 500, oversold: -20 },
    })
    assert.deepEqual(draft.rsi, { period: 2, overbought: 100, oversold: 0 })
  })
})

describe('marketIndicatorStyleDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = baseDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, { ...initial })
    assert.deepEqual(patch, { presentation: {}, rsi: null })
    assert.equal(isMarketIndicatorStyleDraftPatchEmpty(patch), true)
  })

  it('commits only the changed presentation field', () => {
    const initial = baseDraft()
    const patch = marketIndicatorStyleDraftPatch(initial, {
      ...initial,
      opacityPercent: 45,
    })
    assert.deepEqual(patch, { presentation: { opacity: 45 }, rsi: null })
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
    })
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
    const edited = { ...initial, color: '#000000', rsi: { period: 30, overbought: 75, oversold: 25 } }
    assert.deepEqual(marketIndicatorStyleDraftPatch(initial, initial), {
      presentation: {},
      rsi: null,
    })
    assert.notDeepEqual(edited, initial)
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
      }),
      initial,
    )
  })
})
