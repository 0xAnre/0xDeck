import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
  WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY,
} from '../fixedRangeVolumeProfileInstancesStorage.ts'
import {
  createFixedRangeVolumeProfileInstance,
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
  MAX_FIXED_RANGE_VP_ROW_COUNT,
  normalizeFixedRangeVolumeProfileTimes,
  sanitizeFixedRangeVolumeProfileInstances,
} from './fixedRangeVolumeProfileInstances.ts'
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT as DEFAULT_FIXED_RANGE_VP_ROW_COUNT_SOURCE,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT as DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT_SOURCE,
} from './fixedRangeVolumeProfile.ts'
import { resolveChartEventTime } from './fixedRangeVolumeProfileChartTime.ts'
import {
  DEFAULT_FRVP_LEVEL_LINE_WIDTH,
  DEFAULT_FRVP_POC_LINE_STYLE,
  DEFAULT_FRVP_POC_STROKE_OPACITY_PERCENT,
  DEFAULT_FRVP_VAH_LINE_STYLE,
  DEFAULT_FRVP_VAL_LINE_STYLE,
  frvpInstanceLevelLineStyle,
  frvpInstanceLevelLineWidth,
  frvpInstanceLevelStrokeOpacityPercent,
  frvpLevelStrokeColorInputValue,
} from './frvpInstanceLineStyles.ts'
import {
  FRVP_POC_DEFAULT_HEX,
  FRVP_VAH_VAL_DEFAULT_HEX,
} from './frvpLevelLineColors.ts'
import {
  frvpHistogramColorInputValue,
  frvpHistogramOpacityPercent,
} from './frvpHistogramStyles.ts'
import { MARKET_STYLE_PALETTE } from './marketStylePalette.ts'

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

  it('sanitizes a missing or invalid extendRight to false', () => {
    const instances = sanitizeFixedRangeVolumeProfileInstances([
      {
        id: 'frvp-legacy-extend',
        fromTime: 100,
        toTime: 200,
        selectionInterval: '1m',
        rowCount: 24,
        valueAreaPercent: 70,
        enabled: true,
      },
      {
        id: 'frvp-invalid-extend',
        fromTime: 300,
        toTime: 400,
        selectionInterval: '1m',
        rowCount: 24,
        valueAreaPercent: 70,
        enabled: true,
        extendRight: 'yes',
      },
      {
        id: 'frvp-valid-extend',
        fromTime: 500,
        toTime: 600,
        selectionInterval: '1m',
        rowCount: 24,
        valueAreaPercent: 70,
        enabled: true,
        extendRight: true,
      },
    ])
    assert.equal(instances.length, 3)
    assert.equal(instances[0].extendRight, false)
    assert.equal(instances[1].extendRight, false)
    assert.equal(instances[2].extendRight, true)
  })

  it('persists and reloads extendRight without changing the coordinates', () => {
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

    const created = createFixedRangeVolumeProfileInstance({
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
      extendRight: true,
    })
    assert.notEqual(created, null)
    saveWidgetFixedRangeVolumeProfileInstances('panel-extend', [created!])

    const loaded = loadWidgetFixedRangeVolumeProfileInstances('panel-extend', {
      selectionIntervalFallback: '1m',
    })
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].extendRight, true)
    assert.equal(loaded[0].fromTime, 1_000)
    assert.equal(loaded[0].toTime, 2_000)

    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    memory.delete(WIDGET_FIXED_RANGE_VP_INSTANCES_STORAGE_KEY)
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

  it('clamps excessive rowCount when sanitizing persisted instances', () => {
    const sanitized = sanitizeFixedRangeVolumeProfileInstances([
      {
        id: 'frvp-huge-rows',
        fromTime: 100,
        toTime: 200,
        selectionInterval: '1m',
        rowCount: 1_000_000,
        valueAreaPercent: 70,
        enabled: true,
      },
    ])
    assert.equal(sanitized.length, 1)
    assert.equal(sanitized[0].rowCount, MAX_FIXED_RANGE_VP_ROW_COUNT)
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

  it('creates new profiles with 68 rows, 68% value area and Extend Right on', () => {
    const created = createFixedRangeVolumeProfileInstance({
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
    })
    assert.notEqual(created, null)
    assert.equal(created!.rowCount, 68)
    assert.equal(created!.valueAreaPercent, 68)
    assert.equal(created!.extendRight, true)
    // One source of truth for the numeric defaults.
    assert.equal(DEFAULT_FIXED_RANGE_VP_ROW_COUNT, DEFAULT_FIXED_RANGE_VP_ROW_COUNT_SOURCE)
    assert.equal(
      DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
      DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT_SOURCE,
    )
  })

  it('creates new profiles with the POC red Dot and grey VAH/VAL Line defaults', () => {
    const created = createFixedRangeVolumeProfileInstance({
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
    })
    if (!created) throw new Error('expected a created FRVP instance')

    assert.equal(FRVP_POC_DEFAULT_HEX, MARKET_STYLE_PALETTE.pocRed)
    assert.equal(FRVP_VAH_VAL_DEFAULT_HEX, MARKET_STYLE_PALETTE.medium)

    assert.equal(frvpLevelStrokeColorInputValue(created, 'poc'), '#D15F5B')
    assert.equal(frvpLevelStrokeColorInputValue(created, 'vah'), '#A3A3A3')
    assert.equal(frvpLevelStrokeColorInputValue(created, 'val'), '#A3A3A3')
    for (const kind of ['poc', 'vah', 'val'] as const) {
      assert.equal(frvpInstanceLevelStrokeOpacityPercent(created, kind), 50)
      assert.equal(
        frvpInstanceLevelStrokeOpacityPercent(created, kind),
        DEFAULT_FRVP_POC_STROKE_OPACITY_PERCENT,
      )
      assert.equal(frvpInstanceLevelLineWidth(created, kind), 3)
      assert.equal(frvpInstanceLevelLineWidth(created, kind), DEFAULT_FRVP_LEVEL_LINE_WIDTH)
    }
    assert.equal(frvpInstanceLevelLineStyle(created, 'poc'), 'dotted')
    assert.equal(frvpInstanceLevelLineStyle(created, 'poc'), DEFAULT_FRVP_POC_LINE_STYLE)
    assert.equal(frvpInstanceLevelLineStyle(created, 'vah'), 'solid')
    assert.equal(frvpInstanceLevelLineStyle(created, 'vah'), DEFAULT_FRVP_VAH_LINE_STYLE)
    assert.equal(frvpInstanceLevelLineStyle(created, 'val'), 'solid')
    assert.equal(frvpInstanceLevelLineStyle(created, 'val'), DEFAULT_FRVP_VAL_LINE_STYLE)

    // Histogram uses the documented default appearance until the user changes it.
    assert.equal(frvpHistogramColorInputValue(created, 'up'), '#DBDBDB')
    assert.equal(frvpHistogramColorInputValue(created, 'down'), '#808080')
    assert.equal(frvpHistogramOpacityPercent(created, 'up'), 50)
    assert.equal(frvpHistogramOpacityPercent(created, 'down'), 50)
  })

  it('keeps the persisted settings of previously saved profiles (no migration)', () => {
    const stored = {
      id: 'frvp-saved',
      fromTime: 1_000,
      toTime: 2_000,
      selectionInterval: '1m',
      rowCount: 24,
      valueAreaPercent: 70,
      enabled: true,
      extendRight: false,
      pocStrokeColor: '#112233',
      pocLineWidth: 2,
      pocLineStyle: 'solid',
      pocStrokeOpacityPercent: 30,
      vahLineStyle: 'dotted',
    }
    const sanitized = sanitizeFixedRangeVolumeProfileInstances([stored])
    assert.equal(sanitized.length, 1)
    const instance = sanitized[0]
    assert.equal(instance.rowCount, 24)
    assert.equal(instance.valueAreaPercent, 70)
    assert.equal(instance.extendRight, false)
    assert.equal(instance.pocStrokeColor, '#112233')
    assert.equal(instance.pocLineWidth, 2)
    assert.equal(instance.pocLineStyle, 'solid')
    assert.equal(instance.pocStrokeOpacityPercent, 30)
    assert.equal(instance.vahLineStyle, 'dotted')
    // Untouched fields still resolve to the new documented defaults...
    assert.equal(frvpLevelStrokeColorInputValue(instance, 'vah'), '#A3A3A3')
    assert.equal(frvpInstanceLevelStrokeOpacityPercent(instance, 'vah'), 50)
    // ...but nothing is rewritten into the stored record itself.
    assert.equal(instance.histogramUpColor, undefined)
    assert.equal(instance.histogramUpOpacityPercent, undefined)
    assert.deepEqual(
      Object.keys(sanitizeFixedRangeVolumeProfileInstances([instance])[0]).sort(),
      Object.keys(instance).sort(),
    )
  })
})
