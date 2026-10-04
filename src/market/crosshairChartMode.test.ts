import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CrosshairMode } from 'lightweight-charts'
import { crosshairModeForEnabled } from './crosshairChartMode.ts'

describe('crosshairChartMode', () => {
  it('maps enabled to magnet crosshair', () => {
    assert.equal(crosshairModeForEnabled(true), CrosshairMode.Magnet)
  })

  it('maps disabled to hidden crosshair', () => {
    assert.equal(crosshairModeForEnabled(false), CrosshairMode.Hidden)
  })
})
