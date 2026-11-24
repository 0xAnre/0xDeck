import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  frvpSettingsDraftFromInstance,
  frvpSettingsDraftPatch,
  isFrvpSettingsDraftPatchEmpty,
  sanitizeFrvpSettingsDraft,
} from './fixedRangeVolumeProfileSettingsDraft.ts'
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
  MAX_FIXED_RANGE_VP_ROW_COUNT,
  type FixedRangeVolumeProfileInstance,
} from '../market/fixedRangeVolumeProfileInstances.ts'
import {
  DEFAULT_FRVP_LEVEL_LINE_WIDTH,
  frvpInstanceLevelLineStyle,
  frvpInstanceLevelLineWidth,
  frvpLevelStrokeColorInputValue,
} from '../market/frvpInstanceLineStyles.ts'
import {
  FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT_INPUT,
  FRVP_HISTOGRAM_MAX_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_MAX_WIDTH_PERCENT,
  FRVP_HISTOGRAM_MIN_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_MIN_WIDTH_PERCENT,
  frvpHistogramColorInputValue,
} from '../market/frvpHistogramStyles.ts'

function frvpInstance(
  overrides: Partial<FixedRangeVolumeProfileInstance> = {},
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-abcd1234',
    fromTime: 1_700_000_000,
    toTime: 1_700_003_600,
    selectionInterval: '15m',
    rowCount: DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
    valueAreaPercent: DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
    enabled: true,
    displaySequence: 1,
    extendRight: true,
    ...overrides,
  }
}

describe('frvpSettingsDraftFromInstance', () => {
  it('resolves profile and style defaults', () => {
    const draft = frvpSettingsDraftFromInstance(frvpInstance())
    assert.equal(draft.rowCount, DEFAULT_FIXED_RANGE_VP_ROW_COUNT)
    assert.equal(draft.valueAreaPercent, DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT)
    assert.equal(draft.extendRight, true)
    assert.equal(draft.histogram.up.opacityPercent, FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT)
    assert.equal(draft.histogram.down.opacityPercent, FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT)
    assert.equal(draft.histogramWidthPercent, FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT_INPUT)
    assert.equal(
      draft.histogramBarHeightPercent,
      FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT,
    )
    assert.equal(draft.levels.poc.lineWidth, DEFAULT_FRVP_LEVEL_LINE_WIDTH)
    assert.equal(draft.levels.poc.lineStyle, 'dotted')
    assert.equal(draft.levels.vah.lineStyle, 'solid')
    assert.equal(draft.levels.val.lineStyle, 'solid')
  })

  it('mirrors the instance accessors for stored overrides', () => {
    const instance = frvpInstance({
      pocStrokeColor: '#112233',
      pocStrokeOpacityPercent: 44,
      pocLineWidth: 2,
      vahLineStyle: 'dotted',
      histogramUpOpacityPercent: 90,
      histogramWidthPercent: 62.5,
      histogramBarHeightPercent: 44,
    })
    const draft = frvpSettingsDraftFromInstance(instance)
    assert.equal(draft.levels.poc.color, frvpLevelStrokeColorInputValue(instance, 'poc'))
    assert.equal(draft.levels.poc.color, '#112233')
    assert.equal(draft.levels.poc.opacityPercent, 44)
    assert.equal(draft.levels.poc.lineWidth, frvpInstanceLevelLineWidth(instance, 'poc'))
    assert.equal(draft.levels.vah.lineStyle, 'dotted')
    assert.equal(draft.histogram.up.opacityPercent, 90)
    assert.equal(draft.histogramWidthPercent, 62.5)
    assert.equal(draft.histogramBarHeightPercent, 44)
    assert.equal(
      draft.histogram.down.color,
      frvpHistogramColorInputValue(instance, 'down'),
    )
  })
})

describe('frvpSettingsDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, {
      ...initial,
      histogram: { ...initial.histogram },
      levels: { ...initial.levels },
    })
    assert.deepEqual(patch, { histogram: [], levels: [] })
    assert.equal(isFrvpSettingsDraftPatchEmpty(patch), true)
    // The legacy width display (16.7) is not a changed field.
    assert.equal(initial.histogramWidthPercent, 16.7)
    assert.equal(patch.histogramWidthPercent, undefined)
    assert.equal(patch.histogramBarHeightPercent, undefined)
  })

  it('commits only the changed profile numbers', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, {
      ...initial,
      rowCount: 120,
      valueAreaPercent: 80,
    })
    assert.deepEqual(patch, { rowCount: 120, valueAreaPercent: 80, histogram: [], levels: [] })
  })

  it('commits only the changed extend-right flag', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, { ...initial, extendRight: false })
    assert.deepEqual(patch, { extendRight: false, histogram: [], levels: [] })
  })

  it('commits one level patch with only the changed keys', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, {
      ...initial,
      levels: {
        ...initial.levels,
        poc: { ...initial.levels.poc, color: '#AABBCC', lineWidth: 4 },
      },
    })
    assert.deepEqual(patch.levels, [{ kind: 'poc', strokeColor: '#AABBCC', lineWidth: 4 }])
    assert.deepEqual(patch.histogram, [])
  })

  it('commits one histogram patch with only the changed keys', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, {
      ...initial,
      histogram: {
        ...initial.histogram,
        down: { ...initial.histogram.down, opacityPercent: 15 },
      },
    })
    assert.deepEqual(patch.histogram, [{ direction: 'down', opacityPercent: 15 }])
    assert.deepEqual(patch.levels, [])
  })

  it('discarding an edited draft produces no commit and keeps the saved values', () => {
    const instance = frvpInstance({ rowCount: 40, valueAreaPercent: 68 })
    const snapshot = { ...instance }
    const initial = frvpSettingsDraftFromInstance(instance)
    const edited = { ...initial, rowCount: 500, extendRight: false }

    assert.deepEqual(instance, snapshot)
    assert.deepEqual(frvpSettingsDraftPatch(initial, initial), { histogram: [], levels: [] })
    assert.deepEqual(frvpSettingsDraftFromInstance(instance), initial)
    assert.notDeepEqual(edited, initial)
  })
})

describe('sanitizeFrvpSettingsDraft', () => {
  it('clamps typed numbers on blur/Save without writing storage', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const sanitized = sanitizeFrvpSettingsDraft(initial, {
      ...initial,
      rowCount: 9999,
      valueAreaPercent: 250,
    })
    assert.equal(sanitized.rowCount, MAX_FIXED_RANGE_VP_ROW_COUNT)
    assert.equal(sanitized.valueAreaPercent, 100)
    // The opened values are untouched: sanitizing is draft-only.
    assert.equal(initial.rowCount, DEFAULT_FIXED_RANGE_VP_ROW_COUNT)
    assert.equal(initial.valueAreaPercent, DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT)
  })

  it('restores the opened values for non-numeric and invalid style input', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const sanitized = sanitizeFrvpSettingsDraft(initial, {
      ...initial,
      rowCount: Number.NaN,
      valueAreaPercent: -5,
      levels: {
        ...initial.levels,
        poc: { ...initial.levels.poc, color: 'red', lineWidth: 8 as never, lineStyle: 'wavy' as never },
      },
    })
    assert.equal(
      sanitized.rowCount,
      DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
    )
    assert.equal(sanitized.valueAreaPercent, 0)
    assert.equal(sanitized.levels.poc.color, initial.levels.poc.color)
    assert.equal(sanitized.levels.poc.lineWidth, initial.levels.poc.lineWidth)
    assert.equal(sanitized.levels.poc.lineStyle, initial.levels.poc.lineStyle)
    assert.equal(frvpInstanceLevelLineStyle(frvpInstance(), 'poc'), 'dotted')
  })
})

describe('FRVP profile bar size draft', () => {
  it('commits only the changed width and row height', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, {
      ...initial,
      histogramWidthPercent: 40,
      histogramBarHeightPercent: 45,
    })
    assert.deepEqual(patch, {
      histogramWidthPercent: 40,
      histogramBarHeightPercent: 45,
      histogram: [],
      levels: [],
    })
    assert.equal(isFrvpSettingsDraftPatchEmpty(patch), false)
  })

  it('commits combined size, row count and color edits together', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const patch = frvpSettingsDraftPatch(initial, {
      ...initial,
      rowCount: 40,
      histogramWidthPercent: 30,
      histogramBarHeightPercent: 60,
      histogram: {
        ...initial.histogram,
        up: { ...initial.histogram.up, color: '#112233', opacityPercent: 80 },
        down: { ...initial.histogram.down, color: '#445566' },
      },
      levels: {
        ...initial.levels,
        poc: { ...initial.levels.poc, lineWidth: 4 },
      },
    })
    assert.equal(patch.rowCount, 40)
    assert.equal(patch.histogramWidthPercent, 30)
    assert.equal(patch.histogramBarHeightPercent, 60)
    assert.deepEqual(patch.histogram, [
      { direction: 'up', color: '#112233', opacityPercent: 80 },
      { direction: 'down', color: '#445566' },
    ])
    assert.deepEqual(patch.levels, [{ kind: 'poc', lineWidth: 4 }])
  })

  it('clamps typed size values on blur/Save without mutating the opened draft', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance())
    const sanitized = sanitizeFrvpSettingsDraft(initial, {
      ...initial,
      histogramWidthPercent: 250,
      histogramBarHeightPercent: -20,
    })
    assert.equal(sanitized.histogramWidthPercent, FRVP_HISTOGRAM_MAX_WIDTH_PERCENT)
    assert.equal(
      sanitized.histogramBarHeightPercent,
      FRVP_HISTOGRAM_MIN_BAR_HEIGHT_PERCENT,
    )
    assert.equal(sanitized.histogramWidthPercent, 100)
    assert.equal(sanitized.histogramBarHeightPercent, 1)
    // Opening values stay untouched.
    assert.equal(initial.histogramWidthPercent, 16.7)
    assert.equal(initial.histogramBarHeightPercent, 100)

    const lowWidth = sanitizeFrvpSettingsDraft(initial, {
      ...initial,
      histogramWidthPercent: 0,
      histogramBarHeightPercent: 500,
    })
    assert.equal(lowWidth.histogramWidthPercent, FRVP_HISTOGRAM_MIN_WIDTH_PERCENT)
    assert.equal(
      lowWidth.histogramBarHeightPercent,
      FRVP_HISTOGRAM_MAX_BAR_HEIGHT_PERCENT,
    )
  })

  it('falls back to the opened size values for NaN/infinite input', () => {
    const initial = frvpSettingsDraftFromInstance(frvpInstance({
      histogramWidthPercent: 55,
      histogramBarHeightPercent: 35,
    }))
    const sanitized = sanitizeFrvpSettingsDraft(initial, {
      ...initial,
      histogramWidthPercent: Number.NaN,
      histogramBarHeightPercent: Number.POSITIVE_INFINITY,
    })
    assert.equal(sanitized.histogramWidthPercent, 55)
    assert.equal(sanitized.histogramBarHeightPercent, 35)
  })

  it('discards an edited size draft without a commit', () => {
    const instance = frvpInstance({
      histogramWidthPercent: 25,
      histogramBarHeightPercent: 50,
    })
    const initial = frvpSettingsDraftFromInstance(instance)
    const edited = {
      ...initial,
      histogramWidthPercent: 90,
      histogramBarHeightPercent: 10,
    }
    const sanitized = sanitizeFrvpSettingsDraft(initial, edited)
    const patch = frvpSettingsDraftPatch(initial, sanitized)
    assert.equal(patch.histogramWidthPercent, 90)
    assert.equal(patch.histogramBarHeightPercent, 10)
    // The persisted instance and opened draft are untouched by a discarded draft.
    assert.equal(instance.histogramWidthPercent, 25)
    assert.equal(instance.histogramBarHeightPercent, 50)
    assert.deepEqual(frvpSettingsDraftFromInstance(instance), initial)
  })
})
