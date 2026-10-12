import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { sanitizeFixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { readFrvpPocLineColorInputHex } from './frvpLevelLineColors.ts'
import { lineChartStrokeDashPattern } from './lineChartStroke.ts'
import {
  DEFAULT_FRVP_LEVEL_LINE_WIDTH,
  DEFAULT_FRVP_VAH_LINE_STYLE,
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

  it('defaults POC to solid and VAH/VAL to dashed with legacy opacity', () => {
    const instance = baseInstance()
    assert.equal(frvpInstanceLevelLineStyle(instance, 'poc'), 'solid')
    assert.equal(frvpInstanceLevelLineStyle(instance, 'vah'), 'dashed')
    assert.equal(frvpInstanceLevelLineStyle(instance, 'val'), 'dashed')
    assert.deepEqual(frvpInstanceLevelLineDash(instance, 'poc'), [])
    assert.deepEqual(
      frvpInstanceLevelLineDash(instance, 'vah'),
      lineChartStrokeDashPattern(DEFAULT_FRVP_VAH_LINE_STYLE),
    )
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
