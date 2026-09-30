import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { migrateLegacyRollingVwapToInstances } from './rollingVwapInstancesMigration.ts'
import {
  ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID,
  createRollingVwapInstance,
} from './rollingVwapInstances.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'

describe('migrateLegacyRollingVwapToInstances', () => {
  it('does not migrate when instances entry already exists', () => {
    const existing = [
      createRollingVwapInstance({ id: 'rvwap-1', randomId: () => '1' }),
    ]
    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: true,
      loadedInstances: existing,
      activeIndicators: ['rolling-vwap', 'daily-vwap'],
      legacySettings: createDefaultRollingVwapSettings(),
    })
    assert.equal(result.migrationNeeded, false)
    assert.equal(result.instances.length, 1)
    assert.deepEqual(result.activeIndicators, ['rolling-vwap', 'daily-vwap'])
  })

  it('does not recreate legacy instance when entry is an intentional empty list', () => {
    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: true,
      loadedInstances: [],
      activeIndicators: ['rolling-vwap'],
      legacySettings: createDefaultRollingVwapSettings(),
    })
    assert.equal(result.migrationNeeded, false)
    assert.deepEqual(result.instances, [])
  })

  it('migrates active legacy rolling-vwap into one enabled instance with settings', () => {
    const legacy = createDefaultRollingVwapSettings()
    legacy.minBars = 17
    legacy.multipliers.multiplier1 = 1.5

    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['triple-ema', 'rolling-vwap'],
      legacySettings: legacy,
    })

    assert.equal(result.migrationNeeded, true)
    assert.equal(result.instances.length, 1)
    assert.equal(result.instances[0].id, ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID)
    assert.equal(result.instances[0].enabled, true)
    assert.equal(result.instances[0].settings.minBars, 17)
    assert.equal(result.instances[0].settings.multipliers.multiplier1, 1.5)
    assert.deepEqual(result.activeIndicators, ['triple-ema'])
  })

  it('creates an empty instance list when legacy indicator is inactive', () => {
    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['daily-vwap'],
      legacySettings: createDefaultRollingVwapSettings(),
    })
    assert.equal(result.migrationNeeded, true)
    assert.deepEqual(result.instances, [])
    assert.deepEqual(result.activeIndicators, ['daily-vwap'])
  })

  it('is idempotent once instances entry exists', () => {
    const legacy = createDefaultRollingVwapSettings()
    legacy.minBars = 21
    const first = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['rolling-vwap'],
      legacySettings: legacy,
    })
    const second = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: true,
      loadedInstances: first.instances,
      activeIndicators: first.activeIndicators,
      legacySettings: legacy,
    })
    assert.equal(first.migrationNeeded, true)
    assert.equal(second.migrationNeeded, false)
    assert.deepEqual(second.instances, first.instances)
    assert.deepEqual(second.activeIndicators, [])
  })
})
