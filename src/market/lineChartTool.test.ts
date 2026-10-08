import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLineChartInteractionMode } from './lineChartTool.ts'
import { INITIAL_LINE_INTERACTION_STATE, startLineCreateDraft, armLineTool } from './lineInteraction.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'

describe('lineChartTool', () => {
  it('locks chart navigation while creating a line', () => {
    const options: Array<{ handleScroll: { pressedMouseMove: boolean } }> = []
    const chart = {
      applyOptions: (value: { handleScroll: { pressedMouseMove: boolean } }) => {
        options.push(value)
      },
    }
    applyLineChartInteractionMode(
      chart as never,
      INITIAL_LINE_INTERACTION_STATE,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    applyLineChartInteractionMode(
      chart as never,
      startLineCreateDraft(armLineTool(INITIAL_LINE_INTERACTION_STATE), 1, 1),
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    assert.equal(options[0]?.handleScroll.pressedMouseMove, true)
    assert.equal(options[1]?.handleScroll.pressedMouseMove, false)
  })
})
