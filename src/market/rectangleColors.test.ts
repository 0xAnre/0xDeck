import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RECTANGLE_FILL_OPACITY,
  RECTANGLE_HANDLE_FILL_OPACITY,
  readRectangleFillStyle,
  readRectangleHandleFillStyle,
} from './rectangleColors.ts'

describe('rectangleColors', () => {
  it('uses 20% fill opacity and 85% handle opacity constants', () => {
    assert.equal(RECTANGLE_FILL_OPACITY, 0.2)
    assert.equal(RECTANGLE_HANDLE_FILL_OPACITY, 0.85)
  })

  it('applies fill and handle alpha in resolved styles (no document)', () => {
    assert.equal(readRectangleFillStyle(), 'rgba(115, 115, 115, 0.2)')
    assert.equal(readRectangleHandleFillStyle(), 'rgba(115, 115, 115, 0.85)')
  })
})
