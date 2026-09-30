import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
  WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY,
} from '../fixedRangeVolumeProfileInstancesStorage.ts'
import {
  createFixedRangeVolumeProfileInstance,
  sanitizeFixedRangeVolumeProfileInstances,
} from './fixedRangeVolumeProfileInstances.ts'

describe('fixedRangeVolumeProfileInstances storage', () => {
  const panelA = 'panel-a'
  const panelB = 'panel-b'

  it('stores instances per widget panel', () => {
    const memory = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value)
        },
        removeItem: (key: string) => {
          memory.delete(key)
        },
      },
    })

    const instance = createFixedRangeVolumeProfileInstance({ fromTime: 10, toTime: 20 })
    assert.notEqual(instance, null)
    saveWidgetFixedRangeVolumeProfileInstances(panelA, [instance!])
    saveWidgetFixedRangeVolumeProfileInstances(panelB, [])

    const loadedA = loadWidgetFixedRangeVolumeProfileInstances(panelA)
    const loadedB = loadWidgetFixedRangeVolumeProfileInstances(panelB)
    assert.equal(loadedA.length, 1)
    assert.equal(loadedB.length, 0)

    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    memory.delete(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)
  })

  it('returns empty list for invalid json', () => {
    const memory = new Map<string, string>([[WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY, '{']])
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value)
        },
        removeItem: (key: string) => {
          memory.delete(key)
        },
      },
    })
    assert.deepEqual(loadWidgetFixedRangeVolumeProfileInstances('any'), [])
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  })

  it('drops invalid and zero-length ranges', () => {
    const sanitized = sanitizeFixedRangeVolumeProfileInstances([
      { id: 'frvp-1', fromTime: 10, toTime: 20, rowCount: 24, valueAreaPercent: 70, enabled: true },
      { id: 'frvp-2', fromTime: 30, toTime: 30, rowCount: 24, valueAreaPercent: 70, enabled: true },
      { id: 'bad', fromTime: 1, toTime: 2, rowCount: 24, valueAreaPercent: 70, enabled: true },
      { id: 'frvp-3', fromTime: Number.NaN, toTime: 40, rowCount: 24, valueAreaPercent: 70, enabled: true },
    ])
    assert.equal(sanitized.length, 1)
    assert.equal(sanitized[0].id, 'frvp-1')
  })

  it('deleting one instance leaves the others intact', () => {
    const first = createFixedRangeVolumeProfileInstance({ fromTime: 10, toTime: 20 })!
    const second = createFixedRangeVolumeProfileInstance({
      fromTime: 30,
      toTime: 40,
      existingIds: new Set([first.id]),
    })!
    const remaining = sanitizeFixedRangeVolumeProfileInstances([first, second]).filter(
      (item) => item.id !== first.id,
    )
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, second.id)
  })

  it('keeps unix seconds without milliseconds', () => {
    const instance = createFixedRangeVolumeProfileInstance({ fromTime: 1_700_000_000, toTime: 1_700_000_600 })
    assert.notEqual(instance, null)
    assert.equal(instance!.fromTime, 1_700_000_000)
    assert.ok(instance!.toTime < 2_000_000_000)
  })
})
