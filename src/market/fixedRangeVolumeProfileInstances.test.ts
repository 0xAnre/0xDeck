import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
  WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY,
} from '../fixedRangeVolumeProfileInstancesStorage.ts'
import {
  createFixedRangeVolumeProfileInstance,
  normalizeFixedRangeVolumeProfileTimes,
  sanitizeFixedRangeVolumeProfileInstances,
} from './fixedRangeVolumeProfileInstances.ts'
import { resolveChartEventTime } from './fixedRangeVolumeProfileChartTime.ts'

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

    const instance = createFixedRangeVolumeProfileInstance({
      fromTime: 10,
      toTime: 20,
      selectionInterval: '1m',
    })
    assert.notEqual(instance, null)
    saveWidgetFixedRangeVolumeProfileInstances(panelA, [instance!])
    saveWidgetFixedRangeVolumeProfileInstances(panelB, [])

    const loadedA = loadWidgetFixedRangeVolumeProfileInstances(panelA, {
      selectionIntervalFallback: '1m',
    })
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
      {
        id: 'frvp-1',
        fromTime: 10,
        toTime: 20,
        selectionInterval: '1m',
        rowCount: 24,
        valueAreaPercent: 70,
        enabled: true,
      },
      { id: 'frvp-2', fromTime: 30, toTime: 30, rowCount: 24, valueAreaPercent: 70, enabled: true },
      { id: 'bad', fromTime: 1, toTime: 2, rowCount: 24, valueAreaPercent: 70, enabled: true },
      { id: 'frvp-3', fromTime: Number.NaN, toTime: 40, rowCount: 24, valueAreaPercent: 70, enabled: true },
    ])
    assert.equal(sanitized.length, 1)
    assert.equal(sanitized[0].id, 'frvp-1')
  })

  it('deleting one instance leaves the others intact', () => {
    const first = createFixedRangeVolumeProfileInstance({
      fromTime: 10,
      toTime: 20,
      selectionInterval: '1m',
    })!
    const second = createFixedRangeVolumeProfileInstance({
      fromTime: 30,
      toTime: 40,
      selectionInterval: '5m',
      existingIds: new Set([first.id]),
    })!
    const remaining = sanitizeFixedRangeVolumeProfileInstances([first, second]).filter(
      (item) => item.id !== first.id,
    )
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, second.id)
  })

  it('rejects zero timestamps during normalization', () => {
    assert.equal(normalizeFixedRangeVolumeProfileTimes(0, 10), null)
    assert.equal(normalizeFixedRangeVolumeProfileTimes(10, 0), null)
    assert.equal(resolveChartEventTime(0), null)
  })

  it('rejects negative timestamps during normalization', () => {
    assert.equal(normalizeFixedRangeVolumeProfileTimes(-1, 10), null)
    assert.equal(normalizeFixedRangeVolumeProfileTimes(10, -5), null)
    assert.equal(resolveChartEventTime(-100), null)
  })

  it('keeps positive unix seconds', () => {
    assert.deepEqual(normalizeFixedRangeVolumeProfileTimes(1_700_000_000, 1_700_000_600), {
      fromTime: 1_700_000_000,
      toTime: 1_700_000_600,
    })
    assert.equal(resolveChartEventTime(1_700_000_000), 1_700_000_000)
  })

  it('upgrades legacy instances with selection interval fallback', () => {
    const upgraded = sanitizeFixedRangeVolumeProfileInstances(
      [{ id: 'frvp-legacy', fromTime: 100, toTime: 200, rowCount: 24, valueAreaPercent: 70, enabled: true }],
      { selectionIntervalFallback: '30m' },
    )
    assert.equal(upgraded.length, 1)
    assert.equal(upgraded[0].selectionInterval, '30m')
  })

  it('falls back to default interval when stored interval is invalid', () => {
    const upgraded = sanitizeFixedRangeVolumeProfileInstances([
      {
        id: 'frvp-bad-interval',
        fromTime: 100,
        toTime: 200,
        selectionInterval: '3m',
        rowCount: 24,
        valueAreaPercent: 70,
        enabled: true,
      },
    ])
    assert.equal(upgraded[0].selectionInterval, '1m')
  })

  it('keeps completed instance selection interval across sanitize', () => {
    const instances = sanitizeFixedRangeVolumeProfileInstances([
      {
        id: 'frvp-keep',
        fromTime: 100,
        toTime: 200,
        selectionInterval: '1w',
        rowCount: 24,
        valueAreaPercent: 70,
        enabled: true,
      },
    ])
    assert.equal(instances[0].selectionInterval, '1w')
  })

  it('keeps unix seconds without milliseconds', () => {
    const instance = createFixedRangeVolumeProfileInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_600,
      selectionInterval: '1m',
    })
    assert.notEqual(instance, null)
    assert.equal(instance!.fromTime, 1_700_000_000)
    assert.ok(instance!.toTime < 2_000_000_000)
  })
})
