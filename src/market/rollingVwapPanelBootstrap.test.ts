import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { migrateLegacyRollingVwapToInstances } from './rollingVwapInstancesMigration.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import { bootstrapRollingVwapPanelState } from './rollingVwapPanelBootstrap.ts'
import { createRollingVwapInstance } from './rollingVwapInstances.ts'
import {
  loadWidgetMarketIndicatorPresentation,
  saveWidgetMarketIndicatorPresentation,
  WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
} from '../marketIndicatorPresentationStorage.ts'
import { WIDGET_MARKET_INDICATORS_STORAGE_KEY } from '../marketIndicatorStorage.ts'
import { WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY } from '../rollingVwapSettingsStorage.ts'
import {
  hasWidgetRollingVwapInstancesEntry,
  loadWidgetRollingVwapInstances,
  WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY,
} from '../rollingVwapInstancesStorage.ts'

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
  } as Storage
})

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).localStorage
})

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

describe('panel bootstrap legacy presentation migration', () => {
  it('folds the stored rolling-vwap presentation into the migrated instance and clears it', () => {
    const legacy = createDefaultRollingVwapSettings()
    legacy.minBars = 19
    legacy.lineColor = '#445566'
    const panelId = 'panel-a'
    memory.set(WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY, JSON.stringify({ [panelId]: legacy }))
    memory.set(
      WIDGET_MARKET_INDICATORS_STORAGE_KEY,
      JSON.stringify({ [panelId]: ['rolling-vwap', 'daily-vwap'] }),
    )
    memory.set(
      WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY,
      JSON.stringify({
        [panelId]: {
          'rolling-vwap': { color: '#112233', opacity: 40, lineWidth: 3, lineStyle: 'dotted' },
          'triple-ema': { color: '#abcdef' },
        },
      }),
    )

    const boot = bootstrapRollingVwapPanelState(panelId)

    assert.equal(boot.migrationApplied, true)
    assert.equal(boot.instances.length, 1)
    assert.equal(boot.instances[0].settings.lineColor, '#112233')
    assert.equal(boot.instances[0].settings.lineOpacity, 40)
    assert.equal(boot.instances[0].settings.lineWidth, 3)
    assert.equal(boot.instances[0].settings.lineStyle, 'dotted')
    assert.equal(boot.instances[0].settings.minBars, 19)
    assert.deepEqual(boot.activeIndicators, ['daily-vwap'])

    // The persisted instance keeps the folded presentation.
    const stored = loadWidgetRollingVwapInstances(panelId)
    assert.equal(stored[0].settings.lineColor, '#112233')

    // The legacy global entry is cleared; other indicator presentations survive.
    assert.deepEqual(loadWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap'), {})
    assert.deepEqual(loadWidgetMarketIndicatorPresentation(panelId, 'triple-ema'), {
      color: '#abcdef',
    })
  })

  it('clears a stale presentation without overwriting existing instance settings', () => {
    const panelId = 'panel-b'
    const existingSettings = createDefaultRollingVwapSettings()
    existingSettings.lineColor = '#00ff00'
    const existing = [
      createRollingVwapInstance({ id: 'rvwap-1', randomId: () => '1', settings: existingSettings }),
    ]
    memory.set(
      WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY,
      JSON.stringify({ [panelId]: existing }),
    )
    saveWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap', { color: '#112233' })

    const boot = bootstrapRollingVwapPanelState(panelId)

    assert.equal(boot.migrationApplied, false)
    assert.equal(boot.instances[0].settings.lineColor, '#00ff00')
    assert.deepEqual(loadWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap'), {})
  })

  it('keeps the legacy presentation when instance persistence fails', () => {
    const panelId = 'panel-c'
    const legacy = createDefaultRollingVwapSettings()
    legacy.minBars = 19
    memory.set(WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY, JSON.stringify({ [panelId]: legacy }))
    memory.set(
      WIDGET_MARKET_INDICATORS_STORAGE_KEY,
      JSON.stringify({ [panelId]: ['rolling-vwap', 'daily-vwap'] }),
    )
    const legacyPresentation = {
      color: '#112233',
      opacity: 40,
      lineWidth: 3 as const,
      lineStyle: 'dotted' as const,
    }
    saveWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap', legacyPresentation)
    saveWidgetMarketIndicatorPresentation(panelId, 'triple-ema', { color: '#abcdef' })

    const originalSetItem = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = (key: string, value: string) => {
      if (key === WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY) {
        throw new Error('QuotaExceededError: instances write blocked')
      }
      originalSetItem.call(globalThis.localStorage, key, value)
    }

    try {
      assert.throws(() => bootstrapRollingVwapPanelState(panelId), /QuotaExceededError/)
    } finally {
      globalThis.localStorage.setItem = originalSetItem
    }

    // The legacy presentation still holds the only copy of the four center-line
    // settings, and no partial/corrupt instance entry was written.
    assert.deepEqual(
      loadWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap'),
      legacyPresentation,
    )
    assert.deepEqual(loadWidgetMarketIndicatorPresentation(panelId, 'triple-ema'), {
      color: '#abcdef',
    })
    assert.equal(hasWidgetRollingVwapInstancesEntry(panelId), false)
    assert.equal(memory.get(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY), undefined)
  })
})
