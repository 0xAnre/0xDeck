import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  commitRollingVwapPanelSettings,
  resolveRollingVwapReapplySettings,
} from './rollingVwapPanelSettingsCommit.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'

describe('commitRollingVwapPanelSettings', () => {
  it('writes sanitized settings to ref synchronously before reapply reads it', () => {
    const ref = { current: createDefaultRollingVwapSettings() }
    ref.current.minBars = 10
    ref.current.multipliers = { multiplier1: 0, multiplier2: 0, multiplier3: 0 }

    const committed = commitRollingVwapPanelSettings(ref, {
      ...ref.current,
      minBars: 25,
      multipliers: { multiplier1: 1, multiplier2: 0, multiplier3: 0 },
    })

    assert.equal(ref.current.minBars, 25)
    assert.equal(ref.current.multipliers.multiplier1, 1)
    assert.equal(committed.minBars, 25)
  })
})

describe('resolveRollingVwapReapplySettings', () => {
  it('uses explicit settings for recompute instead of stale ref', () => {
    const ref = { current: createDefaultRollingVwapSettings() }
    ref.current.multipliers = { multiplier1: 0, multiplier2: 0, multiplier3: 0 }
    const explicit = {
      ...createDefaultRollingVwapSettings(),
      multipliers: { multiplier1: 2, multiplier2: 0, multiplier3: 0 },
    }

    const resolved = resolveRollingVwapReapplySettings(explicit, ref)
    assert.equal(resolved.multipliers.multiplier1, 2)
    assert.equal(ref.current.multipliers.multiplier1, 0)
  })
})
