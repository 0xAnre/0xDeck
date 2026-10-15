import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  createFixedRangeVolumeProfileInstance,
  sanitizeFixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'
import { readFrvpPocLineColorInputHex } from './frvpLevelLineColors.ts'
import { lineChartStrokeDashPattern } from './lineChartStroke.ts'
import {
  DEFAULT_FRVP_LEVEL_LINE_WIDTH,
  DEFAULT_FRVP_POC_LINE_STYLE,
  DEFAULT_FRVP_VAH_LINE_STYLE,
  DEFAULT_FRVP_VAL_LINE_STYLE,
  frvpDrawStyleForInstance,
  frvpInstanceLevelLineDash,
  frvpInstanceLevelLineStyle,
  frvpInstanceLevelLineStrokeStyle,
  frvpInstanceLevelLineWidth,
  frvpInstanceLevelStrokeOpacityPercent,
  frvpLevelStrokeColorInputValue,
  setFrvpInstanceLevelLineStyle,
  setFrvpInstanceLevelLineWidth,
  setFrvpInstanceLevelStrokeColor,
  setFrvpInstanceLevelStrokeOpacityPercent,
} from './frvpInstanceLineStyles.ts'

function baseInstance(): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-test',
    fromTime: 100,
    toTime: 200,
    selectionInterval: '1m',
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
    displaySequence: 1,
  }
}

describe('frvpInstanceLineStyles', () => {
  it('uses theme defaults when instance has no overrides', () => {
    const instance = baseInstance()
    assert.equal(frvpInstanceLevelLineWidth(instance, 'poc'), DEFAULT_FRVP_LEVEL_LINE_WIDTH)
    assert.match(frvpInstanceLevelLineStrokeStyle(instance, 'vah'), /rgba\(/)
    assert.equal(frvpLevelStrokeColorInputValue(instance, 'poc'), readFrvpPocLineColorInputHex())
  })

  it('persists custom colors and widths on the instance', () => {
    let instance = setFrvpInstanceLevelStrokeColor(baseInstance(), 'poc', '#112233')
    instance = setFrvpInstanceLevelLineWidth(instance, 'poc', 2)
    assert.equal(instance.pocStrokeColor, '#112233')
    assert.equal(instance.pocLineWidth, 2)
    assert.match(frvpInstanceLevelLineStrokeStyle(instance, 'poc'), /rgba\(17,\s*34,\s*51/)
    assert.equal(frvpInstanceLevelLineWidth(instance, 'poc'), 2)
  })

  it('defaults POC, VAH and VAL to solid with legacy opacity', () => {
    const instance = baseInstance()
    assert.equal(DEFAULT_FRVP_POC_LINE_STYLE, 'solid')
    assert.equal(DEFAULT_FRVP_VAH_LINE_STYLE, 'solid')
    assert.equal(DEFAULT_FRVP_VAL_LINE_STYLE, 'solid')
    assert.equal(frvpInstanceLevelLineStyle(instance, 'poc'), 'solid')
    assert.equal(frvpInstanceLevelLineStyle(instance, 'vah'), 'solid')
    assert.equal(frvpInstanceLevelLineStyle(instance, 'val'), 'solid')
    assert.deepEqual(frvpInstanceLevelLineDash(instance, 'poc'), [])
    assert.deepEqual(frvpInstanceLevelLineDash(instance, 'vah'), [])
    assert.deepEqual(frvpInstanceLevelLineDash(instance, 'val'), [])
  })

  it('newly created FRVP reports solid lines and empty dash arrays (settings UI and render agree)', () => {
    const created = createFixedRangeVolumeProfileInstance({
      fromTime: 100,
      toTime: 200,
      selectionInterval: '1m',
    })
    if (!created) throw new Error('expected a created FRVP instance')
    assert.equal(created.pocLineStyle, undefined)
    assert.equal(created.vahLineStyle, undefined)
    assert.equal(created.valLineStyle, undefined)

    for (const kind of ['poc', 'vah', 'val'] as const) {
      assert.equal(frvpInstanceLevelLineStyle(created, kind), 'solid')
    }
    const styles = frvpDrawStyleForInstance(created)
    assert.deepEqual(styles.pocLineDash, [])
    assert.deepEqual(styles.vahLineDash, [])
    assert.deepEqual(styles.valLineDash, [])
  })

  it('preserves explicit per-level styles through sanitize and draw output', () => {
    const sanitized = sanitizeFixedRangeVolumeProfileInstance({
      id: 'frvp-custom',
      fromTime: 100,
      toTime: 200,
      selectionInterval: '1m',
      rowCount: 24,
      valueAreaPercent: 70,
      enabled: true,
      pocLineStyle: 'dashed',
      vahLineStyle: 'dotted',
      valLineStyle: 'dashed',
      pocStrokeColor: '#112233',
      vahLineWidth: 2,
      valStrokeOpacityPercent: 40,
    })
    if (!sanitized) throw new Error('expected sanitized FRVP instance')
    assert.equal(frvpInstanceLevelLineStyle(sanitized, 'poc'), 'dashed')
    assert.equal(frvpInstanceLevelLineStyle(sanitized, 'vah'), 'dotted')
    assert.equal(frvpInstanceLevelLineStyle(sanitized, 'val'), 'dashed')
    const styles = frvpDrawStyleForInstance(sanitized)
    assert.deepEqual(styles.pocLineDash, lineChartStrokeDashPattern('dashed'))
    assert.deepEqual(styles.vahLineDash, lineChartStrokeDashPattern('dotted'))
    assert.deepEqual(styles.valLineDash, lineChartStrokeDashPattern('dashed'))
    assert.equal(frvpLevelStrokeColorInputValue(sanitized, 'poc'), '#112233')
    assert.equal(frvpInstanceLevelLineWidth(sanitized, 'vah'), 2)
    assert.equal(frvpInstanceLevelStrokeOpacityPercent(sanitized, 'val'), 40)
  })

  it('applies per-level stroke style and opacity in draw output', () => {
    let instance = setFrvpInstanceLevelLineStyle(baseInstance(), 'vah', 'dotted')
    instance = setFrvpInstanceLevelStrokeOpacityPercent(instance, 'vah', 40)
    assert.equal(frvpInstanceLevelStrokeOpacityPercent(instance, 'vah'), 40)
    const styles = frvpDrawStyleForInstance(instance)
    assert.deepEqual(styles.vahLineDash, lineChartStrokeDashPattern('dotted'))
    assert.match(styles.vahStrokeStyle, /rgba\(/)
  })

  it('sanitizes stored level line style fields', () => {
    const sanitized = sanitizeFixedRangeVolumeProfileInstance({
      id: 'frvp-legacy',
      fromTime: 100,
      toTime: 200,
      rowCount: 24,
      valueAreaPercent: 70,
      enabled: true,
      pocStrokeColor: '#aabbcc',
      vahLineWidth: 4,
      valStrokeColor: 'not-a-color',
      pocLineWidth: 99,
      vahLineStyle: 'dotted',
      valStrokeOpacityPercent: 120,
      pocStrokeOpacityPercent: 50,
    })
    assert.equal(sanitized?.pocStrokeColor, '#aabbcc')
    assert.equal(sanitized?.vahLineWidth, 4)
    assert.equal(sanitized?.valStrokeColor, undefined)
    assert.equal(sanitized?.pocLineWidth, undefined)
    assert.equal(sanitized?.vahLineStyle, 'dotted')
    assert.equal(sanitized?.pocStrokeOpacityPercent, 50)
    assert.equal(sanitized?.valStrokeOpacityPercent, undefined)
  })
})
