import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createRollingVwapInstance } from './rollingVwapInstances.ts'
import {
  createDefaultRollingVwapSettings,
  DEFAULT_ROLLING_VWAP_FILL_COLOR,
  DEFAULT_ROLLING_VWAP_FILL_OPACITY,
} from './rollingVwapSettings.ts'
import {
  hasWidgetRollingVwapInstancesEntry,
  loadWidgetRollingVwapInstances,
  saveWidgetRollingVwapInstances,
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
  }
})

afterEach(() => {
  memory.clear()
})

describe('rollingVwapInstancesStorage', () => {
  it('returns empty list when panel has no entry', () => {
    assert.equal(hasWidgetRollingVwapInstancesEntry('panel-a'), false)
    assert.deepEqual(loadWidgetRollingVwapInstances('panel-a'), [])
  })

  it('isolates instance lists per panel id', () => {
    const a = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    a.settings.minBars = 12
    const b = createRollingVwapInstance({ id: 'b', randomId: () => 'b' })
    b.settings.minBars = 34
    saveWidgetRollingVwapInstances('panel-a', [a])
    saveWidgetRollingVwapInstances('panel-b', [b])
    assert.equal(loadWidgetRollingVwapInstances('panel-a')[0].settings.minBars, 12)
    assert.equal(loadWidgetRollingVwapInstances('panel-b')[0].settings.minBars, 34)
  })

  it('loads a pre-#282 record without rewriting its stored bytes', () => {
    const panelId = 'panel-legacy'
    const stored = {
      [panelId]: [
        {
          id: 'rv-legacy',
          enabled: true,
          settings: {
            minBars: 17,
            multipliers: { multiplier1: 1.5, multiplier2: 0, multiplier3: 2 },
            bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
            fillColor: '#334455',
            fillOpacity: 40,
          },
          displaySequence: 1,
        },
      ],
    }
    const raw = JSON.stringify(stored)
    memory.set(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY, raw)
    const loaded = loadWidgetRollingVwapInstances(panelId)
    assert.equal(loaded[0].settings.bandType, 'stdev')
    assert.deepEqual(loaded[0].settings.bandPercentages, { band1: 0, band2: 0, band3: 0 })
    assert.deepEqual(loaded[0].settings.multipliers, {
      multiplier1: 1.5,
      multiplier2: 0,
      multiplier3: 2,
    })
    // Loading sanitizes in memory only; no eager migration write occurs.
    assert.equal(memory.get(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY), raw)
  })

  it('persists percentage mode and keeps the stdev multipliers on save', () => {
    const panelId = 'panel-percentage'
    const instance = createRollingVwapInstance({ id: 'rv-percent', randomId: () => 'percent' })
    instance.settings.bandType = 'percentage'
    instance.settings.bandPercentages = { band1: 2.5, band2: 0, band3: 7 }
    instance.settings.multipliers = { multiplier1: 1, multiplier2: 2, multiplier3: 3 }
    saveWidgetRollingVwapInstances(panelId, [instance])
    const loaded = loadWidgetRollingVwapInstances(panelId)[0]
    assert.equal(loaded.settings.bandType, 'percentage')
    assert.deepEqual(loaded.settings.bandPercentages, { band1: 2.5, band2: 0, band3: 7 })
    assert.deepEqual(loaded.settings.multipliers, { multiplier1: 1, multiplier2: 2, multiplier3: 3 })
  })

  it('distinguishes missing entry from deliberately saved empty list', () => {
    saveWidgetRollingVwapInstances('panel-empty', [])
    assert.equal(hasWidgetRollingVwapInstancesEntry('panel-empty'), true)
    assert.deepEqual(loadWidgetRollingVwapInstances('panel-empty'), [])
    assert.equal(hasWidgetRollingVwapInstancesEntry('panel-missing'), false)
  })

  it('survives corrupt JSON and sanitizes invalid instances', () => {
    memory.set(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY, '{bad-json')
    assert.deepEqual(loadWidgetRollingVwapInstances('panel-a'), [])

    memory.set(
      WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY,
      JSON.stringify({
        'panel-a': [
          { id: '', enabled: true, settings: {} },
          { id: 'ok', enabled: true, settings: createDefaultRollingVwapSettings() },
        ],
      }),
    )
    const loaded = loadWidgetRollingVwapInstances('panel-a')
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].id, 'ok')
  })

  it('round-trips the per-instance Background color and opacity', () => {
    const instance = createRollingVwapInstance({ id: 'fill', randomId: () => 'fill' })
    instance.settings.fillColor = '#123456'
    instance.settings.fillOpacity = 40
    saveWidgetRollingVwapInstances('panel-a', [instance])

    const raw = memory.get(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY) ?? ''
    assert.match(raw, /"fillColor":"#123456"/)
    assert.match(raw, /"fillOpacity":40/)

    const loaded = loadWidgetRollingVwapInstances('panel-a')
    assert.equal(loaded[0].settings.fillColor, '#123456')
    assert.equal(loaded[0].settings.fillOpacity, 40)
  })

  it('loads legacy records without fill fields using the default without rewriting storage', () => {
    const legacySettings: Record<string, unknown> = { ...createDefaultRollingVwapSettings() }
    delete legacySettings.fillColor
    delete legacySettings.fillOpacity
    const raw = JSON.stringify({
      'panel-a': [
        { id: 'legacy', enabled: true, settings: legacySettings, displaySequence: 1 },
      ],
    })
    memory.set(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY, raw)

    const loaded = loadWidgetRollingVwapInstances('panel-a')
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].settings.fillColor, DEFAULT_ROLLING_VWAP_FILL_COLOR)
    assert.equal(loaded[0].settings.fillOpacity, DEFAULT_ROLLING_VWAP_FILL_OPACITY)
    assert.equal(memory.get(WIDGET_ROLLING_VWAP_INSTANCES_STORAGE_KEY), raw)
  })

  it('does not let mutating a loaded list affect the next load', () => {
    const instance = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    saveWidgetRollingVwapInstances('panel-a', [instance])
    const loaded = loadWidgetRollingVwapInstances('panel-a')
    loaded[0].settings.minBars = 88
    loaded.push(
      createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' }),
    )
    const again = loadWidgetRollingVwapInstances('panel-a')
    assert.equal(again.length, 1)
    assert.equal(again[0].settings.minBars, 10)
  })
})
