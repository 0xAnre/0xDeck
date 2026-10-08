import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRectangleDrawModels,
  getRectangleInstanceOmittedDuringInteraction,
} from './rectangleRenderGeometry.ts'
import { armRectangleTool, startRectangleCreateDraft } from './rectangleInteraction.ts'
import { createRectangleInstance, setRectangleInstanceLocked } from './rectangleInstances.ts'
import { resolveRectangleInstanceFillStyle } from './rectangleColors.ts'

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
      resolveInstanceFillStyle: () => 'rgba(0,0,0,0.3)',
      previewFillStyle: 'rgba(0,0,0,0.3)',
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

  it('omits the persisted instance id while resizing', () => {
    const instance = createRectangleInstance({
      fromTime: 100,
      toTime: 200,
      lowPrice: 10,
      highPrice: 20,
    })!
    const interaction = {
      phase: 'resizing' as const,
      selectedId: instance.id,
      draft: {
        kind: 'resize' as const,
        instanceId: instance.id,
        handle: 'corner-se' as const,
        initialBounds: {
          fromTime: instance.fromTime,
          toTime: instance.toTime,
          lowPrice: instance.lowPrice,
          highPrice: instance.highPrice,
        },
      },
    }
    assert.equal(getRectangleInstanceOmittedDuringInteraction(interaction), instance.id)
  })

  it('renders only the live preview while resizing an instance', () => {
    const instance = createRectangleInstance({
      fromTime: 100,
      toTime: 200,
      lowPrice: 10,
      highPrice: 20,
    })!
    const models = buildRectangleDrawModels({
      instances: [instance],
      interaction: {
        phase: 'resizing',
        selectedId: instance.id,
        draft: {
          kind: 'resize',
          instanceId: instance.id,
          handle: 'corner-se',
          initialBounds: {
            fromTime: instance.fromTime,
            toTime: instance.toTime,
            lowPrice: instance.lowPrice,
            highPrice: instance.highPrice,
          },
        },
      },
      resolveInstanceFillStyle: () => 'rgba(0,0,0,0.3)',
      previewFillStyle: 'rgba(0,0,0,0.3)',
      handleFillStyle: 'rgba(0,0,0,0.8)',
      pointerTime: 250,
      pointerPrice: 5,
      timeToCoordinate: (time) => time,
      priceToY: (price) => 100 - price,
      handleRadiusPx: 4,
    })
    assert.equal(models.length, 1)
    assert.equal(models[0].right, 250)
    assert.equal(models[0].bottom, 95)
    assert.equal(models[0].handles.length, 8)
  })

  it('uses per-instance fill styles and hides handles on locked selections', () => {
    const styled = {
      ...createRectangleInstance({
        fromTime: 100,
        toTime: 200,
        lowPrice: 10,
        highPrice: 20,
      })!,
      fillColor: '#ff0000',
      fillOpacity: 50,
    }
    const locked = setRectangleInstanceLocked(
      createRectangleInstance({
        fromTime: 300,
        toTime: 400,
        lowPrice: 10,
        highPrice: 20,
      })!,
      true,
    )
    const models = buildRectangleDrawModels({
      instances: [styled, locked],
      interaction: { phase: 'inactive', selectedId: locked.id, draft: null },
      resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
      previewFillStyle: 'rgba(0,0,0,0.2)',
      handleFillStyle: 'rgba(0,0,0,0.8)',
      pointerTime: null,
      pointerPrice: null,
      timeToCoordinate: (time) => time,
      priceToY: (price) => 100 - price,
      handleRadiusPx: 4,
    })
    assert.equal(models.length, 2)
    assert.equal(models[0].fillStyle, 'rgba(255, 0, 0, 0.5)')
    assert.equal(models[1].handles.length, 0)
  })

  it('keeps a custom fill on move and resize previews', () => {
    const colored = {
      ...createRectangleInstance({
        fromTime: 100,
        toTime: 200,
        lowPrice: 10,
        highPrice: 20,
      })!,
      fillColor: '#ff0000',
      fillOpacity: 50,
    }
    const faded = {
      ...createRectangleInstance({
        fromTime: 300,
        toTime: 400,
        lowPrice: 10,
        highPrice: 20,
      })!,
      fillOpacity: 40,
    }
    const other = createRectangleInstance({
      fromTime: 500,
      toTime: 600,
      lowPrice: 10,
      highPrice: 20,
    })!
    const defaultFill = 'rgba(0, 0, 0, 0.2)'
    const shared = {
      resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
      previewFillStyle: defaultFill,
      handleFillStyle: 'rgba(0,0,0,0.8)',
      pointerTime: 250,
      pointerPrice: 5,
      timeToCoordinate: (time: number) => time,
      priceToY: (price: number) => 100 - price,
      handleRadiusPx: 4,
    }

    const resizeModels = buildRectangleDrawModels({
      ...shared,
      instances: [colored, other],
      interaction: {
        phase: 'resizing',
        selectedId: colored.id,
        draft: {
          kind: 'resize',
          instanceId: colored.id,
          handle: 'corner-se',
          initialBounds: {
            fromTime: colored.fromTime,
            toTime: colored.toTime,
            lowPrice: colored.lowPrice,
            highPrice: colored.highPrice,
          },
        },
      },
    })
    assert.equal(resizeModels.length, 2)
    assert.equal(resizeModels[0].fillStyle, resolveRectangleInstanceFillStyle(other))
    assert.equal(resizeModels[1].fillStyle, 'rgba(255, 0, 0, 0.5)')

    const moveModels = buildRectangleDrawModels({
      ...shared,
      instances: [faded],
      interaction: {
        phase: 'moving',
        selectedId: faded.id,
        draft: {
          kind: 'move',
          instanceId: faded.id,
          initialBounds: {
            fromTime: faded.fromTime,
            toTime: faded.toTime,
            lowPrice: faded.lowPrice,
            highPrice: faded.highPrice,
          },
          anchorTime: 100,
          anchorPrice: 10,
        },
      },
    })
    assert.equal(moveModels.length, 1)
    assert.equal(moveModels[0].fillStyle, 'rgba(115, 115, 115, 0.4)')

    const creating = startRectangleCreateDraft(
      armRectangleTool({ phase: 'inactive', selectedId: null, draft: null }),
      100,
      10,
    )
    const createModels = buildRectangleDrawModels({
      ...shared,
      instances: [colored],
      interaction: creating,
    })
    assert.equal(createModels.at(-1)?.fillStyle, defaultFill)
  })
})
