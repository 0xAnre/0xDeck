import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FRVP_HANDLE_FILL_OPACITY,
  readFrvpHandleFillStyle,
  readFrvpHandleThemeBaseRgb,
} from './frvpHandleColors.ts'

describe('frvpHandleColors', () => {
  it('uses 85% handle opacity constant', () => {
    assert.equal(FRVP_HANDLE_FILL_OPACITY, 0.85)
  })

  it('applies handle alpha in resolved styles (no document)', () => {
    assert.equal(readFrvpHandleThemeBaseRgb(), 'rgb(115, 115, 115)')
    assert.equal(readFrvpHandleFillStyle(), 'rgba(115, 115, 115, 0.85)')
  })
})
