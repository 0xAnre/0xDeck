import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyRectangleChartInteractionMode,
  attachRectangleChartTool,
} from './rectangleChartTool.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE, startRectangleCreateDraft, armRectangleTool } from './rectangleInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'

describe('rectangleChartTool', () => {
  it('locks chart navigation only while creating or resizing', () => {
    const options: Array<{ handleScroll: { pressedMouseMove: boolean } }> = []
    const chart = {
      applyOptions: (value: { handleScroll: { pressedMouseMove: boolean } }) => {
        options.push(value)
      },
    }
    applyRectangleChartInteractionMode(
      chart as never,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    applyRectangleChartInteractionMode(
      chart as never,
      startRectangleCreateDraft(armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE), 1, 1),
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    assert.equal(options[0]?.handleScroll.pressedMouseMove, true)
    assert.equal(options[1]?.handleScroll.pressedMouseMove, false)
  })

  it('disposes key listener and pane pointer', () => {
    let keyListenerCount = 0
    const originalWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: (type: string) => {
          if (type === 'keydown') keyListenerCount += 1
        },
        removeEventListener: (type: string) => {
          if (type === 'keydown') keyListenerCount -= 1
        },
      },
    })

    const chart = {
      applyOptions: () => {},
      panes: () => [{ getHTMLElement: () => null }],
    }

    const controller = attachRectangleChartTool(chart as never, {
      getSnapshot: () => ({ interaction: INITIAL_RECTANGLE_INTERACTION_STATE, instances: [] }),
      getPointerPreview: () => ({ pointerTime: null, pointerPrice: null }),
      setPointerPreview: () => {},
      onInteractionChange: () => {},
      onInstancesChange: () => {},
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      getChart: () => chart as never,
      getSeries: () => null,
      getFixedRangeVolumeProfileInteraction: () => INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    })

    assert.equal(keyListenerCount, 1)
    controller.dispose()
    assert.equal(keyListenerCount, 0)
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  })
})
