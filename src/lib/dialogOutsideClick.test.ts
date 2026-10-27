import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isPointInsideDialogPanel,
  type DialogPanelRect,
  type DialogPointerPosition,
} from './dialogOutsideClick.ts'

const PANEL: DialogPanelRect = { left: 100, top: 100, right: 300, bottom: 260 }

function point(clientX: number, clientY: number): DialogPointerPosition {
  return { clientX, clientY }
}

describe('isPointInsideDialogPanel', () => {
  it('accepts a point strictly inside the panel', () => {
    assert.equal(isPointInsideDialogPanel(point(200, 180), PANEL), true)
  })

  it('rejects a point outside the panel on every axis', () => {
    assert.equal(isPointInsideDialogPanel(point(99, 180), PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(301, 180), PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(200, 99), PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(200, 261), PANEL), false)
  })

  it('treats the exact border as inside (borders included)', () => {
    assert.equal(isPointInsideDialogPanel(point(100, 180), PANEL), true)
    assert.equal(isPointInsideDialogPanel(point(300, 180), PANEL), true)
    assert.equal(isPointInsideDialogPanel(point(200, 100), PANEL), true)
    assert.equal(isPointInsideDialogPanel(point(200, 260), PANEL), true)
    assert.equal(isPointInsideDialogPanel(point(100, 100), PANEL), true)
    assert.equal(isPointInsideDialogPanel(point(300, 260), PANEL), true)
  })

  it('rejects zero-size and inverted rects', () => {
    const zeroWidth = { left: 100, top: 100, right: 100, bottom: 260 }
    const zeroHeight = { left: 100, top: 100, right: 300, bottom: 100 }
    const zeroArea = { left: 0, top: 0, right: 0, bottom: 0 }
    const inverted = { left: 300, top: 260, right: 100, bottom: 100 }
    assert.equal(isPointInsideDialogPanel(point(100, 180), zeroWidth), false)
    assert.equal(isPointInsideDialogPanel(point(200, 100), zeroHeight), false)
    assert.equal(isPointInsideDialogPanel(point(0, 0), zeroArea), false)
    assert.equal(isPointInsideDialogPanel(point(200, 180), inverted), false)
  })

  it('rejects non-finite pointer coordinates', () => {
    assert.equal(isPointInsideDialogPanel(point(Number.NaN, 180), PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(200, Number.NaN), PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(Number.POSITIVE_INFINITY, 180), PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(200, Number.NEGATIVE_INFINITY), PANEL), false)
  })

  it('rejects non-finite rect edges and missing inputs', () => {
    assert.equal(
      isPointInsideDialogPanel(point(200, 180), { ...PANEL, left: Number.NaN }),
      false,
    )
    assert.equal(
      isPointInsideDialogPanel(point(200, 180), { ...PANEL, bottom: Number.POSITIVE_INFINITY }),
      false,
    )
    assert.equal(isPointInsideDialogPanel(null, PANEL), false)
    assert.equal(isPointInsideDialogPanel(point(200, 180), null), false)
    assert.equal(isPointInsideDialogPanel(undefined, undefined), false)
  })
})
