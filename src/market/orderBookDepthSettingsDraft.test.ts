import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isOrderBookDepthSettingsDraftPatchEmpty,
  orderBookDepthSettingsDraftFrom,
  orderBookDepthSettingsDraftPatch,
  sanitizeOrderBookDepthSettingsDraft,
} from './orderBookDepthSettingsDraft.ts'
import {
  DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
  type OrderBookDepthSettings,
} from './orderBookDepthSettings.ts'

function settings(
  overrides: Partial<OrderBookDepthSettings> = {},
): OrderBookDepthSettings {
  return { ...DEFAULT_ORDER_BOOK_DEPTH_SETTINGS, ...overrides }
}

describe('orderBookDepthSettingsDraftFrom', () => {
  it('copies the saved settings into a fresh draft object', () => {
    const saved = settings({ distance: 0.25, positiveThreshold: 40 })
    const draft = orderBookDepthSettingsDraftFrom(saved)
    assert.deepEqual(draft, {
      source: 'binance',
      distance: 0.25,
      positiveThreshold: 40,
      negativeThreshold: -25,
    })
    assert.notEqual(draft, saved)
  })
})

describe('orderBookDepthSettingsDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = orderBookDepthSettingsDraftFrom(settings())
    const patch = orderBookDepthSettingsDraftPatch(initial, { ...initial })
    assert.deepEqual(patch, {})
    assert.equal(isOrderBookDepthSettingsDraftPatchEmpty(patch), true)
  })

  it('commits only the changed distance and thresholds', () => {
    const initial = orderBookDepthSettingsDraftFrom(settings())
    assert.deepEqual(
      orderBookDepthSettingsDraftPatch(initial, {
        ...initial,
        distance: 0.5,
        positiveThreshold: 60,
        negativeThreshold: -60,
      }),
      { distance: 0.5, positiveThreshold: 60, negativeThreshold: -60 },
    )
  })

  it('discarding an edited draft produces no commit', () => {
    const saved = settings({ distance: 1 })
    const initial = orderBookDepthSettingsDraftFrom(saved)
    const edited = { ...initial, distance: 2.5 as const }

    assert.deepEqual(orderBookDepthSettingsDraftPatch(initial, initial), {})
    assert.deepEqual(orderBookDepthSettingsDraftFrom(saved), initial)
    assert.notDeepEqual(edited, initial)
  })
})

describe('sanitizeOrderBookDepthSettingsDraft', () => {
  it('clamps invalid drafts to sanitized storable settings', () => {
    const initial = orderBookDepthSettingsDraftFrom(settings())
    assert.deepEqual(
      sanitizeOrderBookDepthSettingsDraft(initial, {
        source: 'hyperliquid' as never,
        distance: 3 as never,
        positiveThreshold: 120,
        negativeThreshold: -120,
      }),
      DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
    )
    assert.deepEqual(
      sanitizeOrderBookDepthSettingsDraft(initial, {
        ...initial,
        positiveThreshold: 50.5,
        negativeThreshold: -50.5,
      }),
      {
        ...initial,
        positiveThreshold: 50.5,
        negativeThreshold: -50.5,
      },
    )
  })
})
