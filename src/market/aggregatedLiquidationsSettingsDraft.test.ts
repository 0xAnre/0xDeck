import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregatedLiquidationsSettingsDraftFrom,
  aggregatedLiquidationsSettingsDraftPatch,
  isAggregatedLiquidationsSettingsDraftPatchEmpty,
  sanitizeAggregatedLiquidationsSettingsDraft,
} from './aggregatedLiquidationsSettingsDraft.ts'
import {
  DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
  sanitizeAggregatedLiquidationsSettings,
  type AggregatedLiquidationsSettings,
} from './aggregatedLiquidationsSettings.ts'

function settings(
  overrides: Partial<AggregatedLiquidationsSettings> = {},
): AggregatedLiquidationsSettings {
  return { ...DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS, ...overrides }
}

describe('aggregatedLiquidationsSettingsDraftFrom', () => {
  it('copies the saved settings into a fresh draft object', () => {
    const saved = settings({ position: 'top' })
    const draft = aggregatedLiquidationsSettingsDraftFrom(saved)
    assert.deepEqual(draft, { source: 'binance', position: 'top' })
    assert.notEqual(draft, saved)
  })
})

describe('aggregatedLiquidationsSettingsDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = aggregatedLiquidationsSettingsDraftFrom(settings())
    const patch = aggregatedLiquidationsSettingsDraftPatch(initial, { ...initial })
    assert.deepEqual(patch, {})
    assert.equal(isAggregatedLiquidationsSettingsDraftPatchEmpty(patch), true)
  })

  it('commits only the changed position', () => {
    const initial = aggregatedLiquidationsSettingsDraftFrom(settings())
    assert.deepEqual(
      aggregatedLiquidationsSettingsDraftPatch(initial, { ...initial, position: 'top' }),
      { position: 'top' },
    )
  })

  it('discarding a changed position produces no commit', () => {
    const saved = settings({ position: 'bottom' })
    const initial = aggregatedLiquidationsSettingsDraftFrom(saved)
    const edited = { ...initial, position: 'top' as const }

    assert.deepEqual(saved, { source: 'binance', position: 'bottom' })
    assert.deepEqual(aggregatedLiquidationsSettingsDraftPatch(initial, initial), {})
    assert.deepEqual(aggregatedLiquidationsSettingsDraftFrom(saved), initial)
    assert.notDeepEqual(edited, initial)
  })
})

describe('sanitizeAggregatedLiquidationsSettingsDraft', () => {
  it('keeps the Binance source and valid positions', () => {
    const initial = aggregatedLiquidationsSettingsDraftFrom(settings())
    assert.deepEqual(
      sanitizeAggregatedLiquidationsSettingsDraft(initial, {
        source: 'binance',
        position: 'top',
      }),
      { source: 'binance', position: 'top' },
    )
  })

  it('falls back to defaults for unsupported sources and positions', () => {
    const initial = aggregatedLiquidationsSettingsDraftFrom(settings())
    assert.deepEqual(
      sanitizeAggregatedLiquidationsSettingsDraft(initial, {
        source: 'hyperliquid',
        position: 'middle' as never,
      }),
      DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
    )
  })

  it('matches the stored-settings sanitizer for the V1 Binance-only rule', () => {
    for (const position of ['bottom', 'top'] as const) {
      const draft = sanitizeAggregatedLiquidationsSettingsDraft(
        aggregatedLiquidationsSettingsDraftFrom(settings()),
        { source: 'binance', position },
      )
      assert.deepEqual(
        draft,
        sanitizeAggregatedLiquidationsSettings({ source: 'binance', position }),
      )
    }
  })
})
