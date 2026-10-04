import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRectangleDrawModels } from './rectangleRenderGeometry.ts'
import { armRectangleTool, startRectangleCreateDraft } from './rectangleInteraction.ts'
import { createRectangleInstance } from './rectangleInstances.ts'

describe('rectangleRenderGeometry', () => {
  it('builds draw models for instances, selection handles, and preview', () => {
    const instance = createRectangleInstance({
      fromTime: 100,
      toTime: 200,
      lowPrice: 10,
      highPrice: 20,
    })!
    const interaction = startRectangleCreateDraft(armRectangleTool({ phase: 'inactive', selectedId: instance.id, draft: null }), 100, 10)
    const models = buildRectangleDrawModels({
      instances: [instance],
      interaction,
      fillStyle: 'rgba(0,0,0,0.3)',
      handleFillStyle: 'rgba(0,0,0,0.8)',
      pointerTime: 150,
      pointerPrice: 15,
      timeToCoordinate: (time) => time,
      priceToY: (price) => 100 - price,
      handleRadiusPx: 4,
    })
    assert.equal(models.length, 2)
    assert.equal(models[0].handles.length, 8)
  })
})
