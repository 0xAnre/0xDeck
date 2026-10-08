import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildLineDrawModels } from './lineRenderGeometry.ts'
import { armLineTool, startLineCreateDraft, updateLineCreatePreview } from './lineInteraction.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'

describe('lineRenderGeometry', () => {
  it('includes preview segment and endpoint handles while resizing', () => {
    const interaction = updateLineCreatePreview(
      startLineCreateDraft(armLineTool(INITIAL_LINE_INTERACTION_STATE), 1_700_000_000, 0),
      1_700_000_300,
      5,
    )
    const models = buildLineDrawModels({
      instances: [],
      interaction,
      strokeStyle: 'gray',
      pointerTime: 1_700_000_300,
      pointerPrice: 5,
      timeToCoordinate: (time) => time,
      priceToY: (price) => price,
    })
    assert.equal(models.length, 1)
    assert.equal(models[0].handles.length, 0)

    const selected = {
      phase: 'inactive' as const,
      selectedId: 'line-abc',
      draft: null,
    }
    const persisted = buildLineDrawModels({
      instances: [
        {
          id: 'line-abc',
          timeA: 1_700_000_000,
          priceA: 0,
          timeB: 1_700_000_300,
          priceB: 10,
        },
      ],
      interaction: selected,
      strokeStyle: 'gray',
      pointerTime: null,
      pointerPrice: null,
      timeToCoordinate: (time) => time,
      priceToY: (price) => price,
    })
    assert.equal(persisted[0].handles.length, 2)
  })
})
