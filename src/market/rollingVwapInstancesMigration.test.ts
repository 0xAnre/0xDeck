import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { migrateLegacyRollingVwapToInstances } from './rollingVwapInstancesMigration.ts'
import {
  ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID,
  createRollingVwapInstance,
} from './rollingVwapInstances.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'

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

  it('folds the legacy global presentation into the migrated instance center line', () => {
    const legacy = createDefaultRollingVwapSettings()
    legacy.minBars = 17
    legacy.multipliers.multiplier2 = 2.5
    legacy.bandColors.band1 = '#010203'
    legacy.bandOpacities.band2 = 12
    legacy.bandLineStyles.band3 = 'dotted'

    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['rolling-vwap'],
      legacySettings: legacy,
      legacyPresentation: {
        color: '#112233',
        opacity: 40,
        lineWidth: 3,
        lineStyle: 'dotted',
      },
    })

    const settings = result.instances[0].settings
    assert.equal(settings.lineColor, '#112233')
    assert.equal(settings.lineOpacity, 40)
    assert.equal(settings.lineWidth, 3)
    assert.equal(settings.lineStyle, 'dotted')

    // Bands, multipliers and period keep the sanitized legacy settings.
    assert.equal(settings.minBars, 17)
    assert.equal(settings.multipliers.multiplier2, 2.5)
    assert.equal(settings.bandColors.band1, '#010203')
    assert.equal(settings.bandOpacities.band2, 12)
    assert.equal(settings.bandLineStyles.band3, 'dotted')
    assert.deepEqual(settings.fixedTimePeriod, legacy.fixedTimePeriod)
  })

  it('falls back to the sanitized legacy settings for invalid presentation values', () => {
    const legacy = createDefaultRollingVwapSettings()
    legacy.lineColor = '#445566'
    legacy.lineOpacity = 55
    legacy.lineWidth = 2
    legacy.lineStyle = 'dotted'

    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: false,
      activeIndicators: ['rolling-vwap'],
      legacySettings: legacy,
      legacyPresentation: {
        color: 'not-a-hex',
        opacity: 250,
        lineWidth: 9,
        lineStyle: 'nonsense',
      } as unknown as MarketIndicatorPresentation,
    })

    const settings = result.instances[0].settings
    assert.equal(settings.lineColor, '#445566')
    assert.equal(settings.lineOpacity, 55)
    assert.equal(settings.lineWidth, 2)
    assert.equal(settings.lineStyle, 'dotted')
  })

  it('never overwrites existing instance settings with a stale presentation', () => {
    const existingSettings = createDefaultRollingVwapSettings()
    existingSettings.lineColor = '#00ff00'
    existingSettings.lineWidth = 2
    const existing = [
      createRollingVwapInstance({ id: 'rvwap-1', randomId: () => '1', settings: existingSettings }),
    ]

    const result = migrateLegacyRollingVwapToInstances({
      hasInstancesEntry: true,
      loadedInstances: existing,
      activeIndicators: ['daily-vwap'],
      legacySettings: createDefaultRollingVwapSettings(),
      legacyPresentation: { color: '#112233', lineWidth: 4, lineStyle: 'dotted' },
    })

    assert.equal(result.migrationNeeded, false)
    assert.equal(result.instances[0].settings.lineColor, '#00ff00')
    assert.equal(result.instances[0].settings.lineWidth, 2)
    assert.equal(result.instances[0].settings.lineStyle, existing[0].settings.lineStyle)
  })
})
