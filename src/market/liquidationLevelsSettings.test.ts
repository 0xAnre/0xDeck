import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
  liquidationLevelsSettingsEqual,
  sanitizeLiquidationLevelsMaxWidthPercent,
  sanitizeLiquidationLevelsSettings,
} from './liquidationLevelsSettings.ts'
import {
  loadWidgetLiquidationLevelsSettings,
  saveWidgetLiquidationLevelsSettings,
  WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY,
} from '../liquidationLevelsSettingsStorage.ts'

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

describe('liquidation level profile settings', () => {
  it('defaults to the semantic green/red pair with a 25% bar extent', () => {
    assert.deepEqual(DEFAULT_LIQUIDATION_LEVELS_SETTINGS, {
      longColor: '#22C55E',
      longOpacityPercent: 60,
      shortColor: '#EF4444',
      shortOpacityPercent: 60,
      maxWidthPercent: 25,
    })
  })

  it('sanitizes field by field instead of discarding the record', () => {
    const sanitized = sanitizeLiquidationLevelsSettings({
      longColor: 'not-a-color',
      longOpacityPercent: 0,
      shortColor: '#123456',
      shortOpacityPercent: 250,
      maxWidthPercent: 1000,
    })
    assert.equal(sanitized.longColor, DEFAULT_LIQUIDATION_LEVELS_SETTINGS.longColor)
    // 0% opacity is a valid, persisted value and must not become "unset".
    assert.equal(sanitized.longOpacityPercent, 0)
    assert.equal(sanitized.shortColor, '#123456')
    assert.equal(sanitized.shortOpacityPercent, 100)
    assert.equal(sanitized.maxWidthPercent, 100)
  })

  it('clamps the bar extent to the supported range', () => {
    assert.equal(sanitizeLiquidationLevelsMaxWidthPercent(0), 5)
    assert.equal(sanitizeLiquidationLevelsMaxWidthPercent(4), 5)
    assert.equal(sanitizeLiquidationLevelsMaxWidthPercent(42.4), 42)
    assert.equal(sanitizeLiquidationLevelsMaxWidthPercent(101), 100)
    assert.equal(
      sanitizeLiquidationLevelsMaxWidthPercent('wide'),
      DEFAULT_LIQUIDATION_LEVELS_SETTINGS.maxWidthPercent,
    )
  })

  it('falls back to defaults for anything that is not a record', () => {
    assert.deepEqual(
      sanitizeLiquidationLevelsSettings(null),
      DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
    )
    assert.deepEqual(
      sanitizeLiquidationLevelsSettings('nope'),
      DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
    )
  })

  it('compares whole records for change detection', () => {
    assert.ok(
      liquidationLevelsSettingsEqual(
        DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
        { ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS },
      ),
    )
    assert.ok(
      !liquidationLevelsSettingsEqual(DEFAULT_LIQUIDATION_LEVELS_SETTINGS, {
        ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
        maxWidthPercent: 30,
      }),
    )
  })
})

describe('liquidation level profile settings storage', () => {
  it('stores the settings per panel so two panels stay independent', () => {
    saveWidgetLiquidationLevelsSettings('chart-a1', {
      ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
      longColor: '#00FF00',
      maxWidthPercent: 50,
    })
    saveWidgetLiquidationLevelsSettings('chart-b2', {
      ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
      shortOpacityPercent: 10,
    })
    assert.equal(loadWidgetLiquidationLevelsSettings('chart-a1').longColor, '#00FF00')
    assert.equal(loadWidgetLiquidationLevelsSettings('chart-a1').maxWidthPercent, 50)
    assert.equal(loadWidgetLiquidationLevelsSettings('chart-b2').shortOpacityPercent, 10)
    assert.deepEqual(
      loadWidgetLiquidationLevelsSettings('chart-unknown'),
      DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
    )
    assert.ok(
      localStorage.getItem(WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY) !== null,
    )
  })

  it('sanitizes what it reads back, including hand-edited records', () => {
    localStorage.setItem(
      WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        'chart-a1': { longColor: '#ZZZZZZ', maxWidthPercent: 900 },
        'chart-b2': 'not-a-record',
      }),
    )
    assert.deepEqual(loadWidgetLiquidationLevelsSettings('chart-a1'), {
      ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
      maxWidthPercent: 100,
    })
    assert.deepEqual(
      loadWidgetLiquidationLevelsSettings('chart-b2'),
      DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
    )
  })

  it('never throws on unreadable storage', () => {
    localStorage.setItem(WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY, '{oops')
    assert.deepEqual(
      loadWidgetLiquidationLevelsSettings('chart-a1'),
      DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
    )
  })
})
