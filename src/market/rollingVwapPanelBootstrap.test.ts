import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { migrateLegacyRollingVwapToInstances } from './rollingVwapInstancesMigration.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'

describe('panel bootstrap migration contract', () => {
  it('migrates legacy active rolling-vwap into one enabled instance', () => {
    const legacy = createDefaultRollingVwapSettings()
    legacy.minBars = 19
    const migrated = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['rolling-vwap', 'daily-vwap'],
      legacySettings: legacy,
    })
    assert.equal(migrated.migrationNeeded, true)
    assert.equal(migrated.instances.length, 1)
    assert.equal(migrated.instances[0].enabled, true)
    assert.equal(migrated.instances[0].settings.minBars, 19)
    assert.deepEqual(migrated.activeIndicators, ['daily-vwap'])
  })

  it('starts with empty instances when legacy indicator is inactive', () => {
    const migrated = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['daily-vwap'],
      legacySettings: createDefaultRollingVwapSettings(),
    })
    assert.equal(migrated.migrationNeeded, true)
    assert.deepEqual(migrated.instances, [])
  })

  it('does not recreate legacy instance when instances entry already exists empty', () => {
    const migrated = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: true,
      loadedInstances: [],
      activeIndicators: ['rolling-vwap'],
      legacySettings: createDefaultRollingVwapSettings(),
    })
    assert.equal(migrated.migrationNeeded, false)
    assert.deepEqual(migrated.instances, [])
  })
})
