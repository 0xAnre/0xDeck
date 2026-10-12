import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { sanitizeFixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import {
  DEFAULT_FRVP_LEVEL_LINE_WIDTH,
  frvpInstanceLevelLineStrokeStyle,
  frvpInstanceLevelLineWidth,
  setFrvpInstanceLevelLineWidth,
  setFrvpInstanceLevelStrokeColor,
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
  })

  it('persists custom colors and widths on the instance', () => {
    let instance = setFrvpInstanceLevelStrokeColor(baseInstance(), 'poc', '#112233')
    instance = setFrvpInstanceLevelLineWidth(instance, 'poc', 2)
    assert.equal(instance.pocStrokeColor, '#112233')
    assert.equal(instance.pocLineWidth, 2)
    assert.match(frvpInstanceLevelLineStrokeStyle(instance, 'poc'), /rgba\(17,\s*34,\s*51/)
    assert.equal(frvpInstanceLevelLineWidth(instance, 'poc'), 2)
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
    })
    assert.equal(sanitized?.pocStrokeColor, '#aabbcc')
    assert.equal(sanitized?.vahLineWidth, 4)
    assert.equal(sanitized?.valStrokeColor, undefined)
    assert.equal(sanitized?.pocLineWidth, undefined)
  })
})
