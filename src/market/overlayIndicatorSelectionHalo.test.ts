import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Time } from 'lightweight-charts'
import {
  buildOverlaySelectionHaloPolylines,
  overlaySelectionHaloWidth,
  OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX,
} from './overlayIndicatorSelectionHalo.ts'

const timeScale = (time: Time) => Number(time) * 10
const priceScale = (value: number) => 100 - value

function point(time: number, value: number) {
  return { time: time as Time, value }
}

describe('overlaySelectionHaloWidth', () => {
  it('adds a fixed visual band to the series width', () => {
    assert.equal(overlaySelectionHaloWidth(1), 1 + OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX)
    assert.equal(overlaySelectionHaloWidth(4), 4 + OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX)
  })

  it('falls back to a 1px base for unknown widths', () => {
    assert.equal(overlaySelectionHaloWidth(undefined), 1 + OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX)
    assert.equal(overlaySelectionHaloWidth(Number.NaN), 1 + OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX)
  })
})

describe('buildOverlaySelectionHaloPolylines', () => {
  it('projects a contiguous run into one polyline', () => {
    const polylines = buildOverlaySelectionHaloPolylines(
      [point(1, 10), point(2, 20), point(3, 30)],
      timeScale,
      priceScale,
    )
    assert.deepEqual(polylines, [
      [
        { x: 10, y: 90 },
        { x: 20, y: 80 },
        { x: 30, y: 70 },
      ],
    ])
  })

  it('splits the halo where the series has a gap', () => {
    const polylines = buildOverlaySelectionHaloPolylines(
      [point(1, 10), point(2, 20), null, point(4, 40), point(5, 50)],
      timeScale,
      priceScale,
    )
    assert.deepEqual(polylines, [
      [
        { x: 10, y: 90 },
        { x: 20, y: 80 },
      ],
      [
        { x: 40, y: 60 },
        { x: 50, y: 50 },
      ],
    ])
  })

  it('skips runs too short to stroke and off-screen coordinates', () => {
    const polylines = buildOverlaySelectionHaloPolylines(
      [point(1, 10), null, point(3, 30)],
      () => null,
      priceScale,
    )
    assert.deepEqual(polylines, [])
  })

  it('drops runs with fewer than two resolvable points', () => {
    const polylines = buildOverlaySelectionHaloPolylines(
      [point(1, 10), null],
      timeScale,
      priceScale,
    )
    assert.deepEqual(polylines, [])
  })
})
