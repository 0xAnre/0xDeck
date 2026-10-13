import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import { applyChartDrawingInteractionMode } from './chartDrawingInteractionMode.ts'
import { INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE } from './anchoredVwapDrawingInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'

describe('applyChartDrawingInteractionMode', () => {
  it('locks chart navigation while dragging an anchored VWAP anchor', () => {
    const scrollOptions: Array<{ pressedMouseMove?: boolean }> = []
    const chart = {
      applyOptions: (options: { handleScroll?: { pressedMouseMove?: boolean } }) => {
        if (options.handleScroll) scrollOptions.push(options.handleScroll)
      },
    } as IChartApi

    applyChartDrawingInteractionMode(
      chart,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_LINE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      {
        ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
        phase: 'dragging-anchor',
        selectedId: 'avwap-1',
        draft: { instanceId: 'avwap-1', initialAnchorTime: 100 },
      },
    )

    assert.equal(scrollOptions.at(-1)?.pressedMouseMove, false)
  })
})
