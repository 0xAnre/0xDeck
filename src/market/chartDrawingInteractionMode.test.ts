import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyChartDrawingInteractionMode } from './chartDrawingInteractionMode.ts'
import {
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  startAnchoredVwapAnchorDrag,
} from './anchoredVwapDrawingInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'

describe('chartDrawingInteractionMode', () => {
  it('locks chart navigation while dragging an anchored VWAP anchor', () => {
    const options: Array<{ handleScroll: { pressedMouseMove: boolean } }> = []
    const chart = {
      applyOptions: (value: { handleScroll: { pressedMouseMove: boolean } }) => {
        options.push(value)
      },
    }
    applyChartDrawingInteractionMode(
      chart as never,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_LINE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
    )
    applyChartDrawingInteractionMode(
      chart as never,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_LINE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      startAnchoredVwapAnchorDrag(INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE, 'id', 1),
    )
    assert.equal(options[0]?.handleScroll.pressedMouseMove, true)
    assert.equal(options[1]?.handleScroll.pressedMouseMove, false)
  })
})
