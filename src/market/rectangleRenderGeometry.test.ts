import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRectangleDrawModels,
  getRectangleInstanceOmittedDuringInteraction,
  rectangleHandleKindFromDrawIndex,
  type BuildRectangleDrawModelsArgs,
  type RectangleTimeProjector,
} from './rectangleRenderGeometry.ts'
import { armRectangleTool, startRectangleCreateDraft } from './rectangleInteraction.ts'
import { createRectangleInstance, setRectangleInstanceLocked } from './rectangleInstances.ts'
import { resolveRectangleInstanceFillStyle } from './rectangleColors.ts'

/**
 * Loaded history starts at coordinate 1500: every stored time below it is
 * clipped to 1500, exactly like `projectRectangleTimeToCoordinate` does when a
 * timestamp precedes the first loaded candle.
 */
const LOADED_EDGE_COORDINATE = 1500

function clipAtLoadedEdge(edgeCoordinate: number): RectangleTimeProjector {
  return (time) => {
    const clippedBeforeLoadedHistory = time < edgeCoordinate
    return {
      coordinate: clippedBeforeLoadedHistory ? edgeCoordinate : time,
      clippedBeforeLoadedHistory,
    }
  }
}

const loadedProjector: RectangleTimeProjector = (time) => ({
  coordinate: time,
  clippedBeforeLoadedHistory: false,
})

function sharedArgs(
  overrides: Partial<BuildRectangleDrawModelsArgs> = {},
): BuildRectangleDrawModelsArgs {
  return {
    instances: [],
    interaction: { phase: 'inactive', selectedId: null, draft: null },
    resolveInstanceFillStyle: () => 'rgba(0,0,0,0.3)',
    previewFillStyle: 'rgba(0,0,0,0.3)',
    handleFillStyle: 'rgba(0,0,0,0.8)',
    pointerTime: null,
    pointerPrice: null,
    projectTime: loadedProjector,
    priceToY: (price) => 100 - price,
    handleRadiusPx: 4,
    ...overrides,
  }
}

describe('rectangleRenderGeometry', () => {
  it('builds draw models for instances, selection handles, and preview', () => {
    const instance = createRectangleInstance({
      fromTime: 100,
      toTime: 200,
      lowPrice: 10,
      highPrice: 20,
    })!
    const interaction = startRectangleCreateDraft(armRectangleTool({ phase: 'inactive', selectedId: instance.id, draft: null }), 100, 10)
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction,
        pointerTime: 150,
        pointerPrice: 15,
      }),
    )
    assert.equal(models.length, 2)
    assert.equal(models[0].handles.length, 8)
    assert.equal(models[0].clippedStart, false)
    assert.equal(models[0].clippedEnd, false)
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
    const models = buildRectangleDrawModels(
      sharedArgs({
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
        pointerTime: 250,
        pointerPrice: 5,
      }),
    )
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
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [styled, locked],
        interaction: { phase: 'inactive', selectedId: locked.id, draft: null },
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        previewFillStyle: 'rgba(0,0,0,0.2)',
      }),
    )
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

    const resizeModels = buildRectangleDrawModels(
      sharedArgs({
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
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        previewFillStyle: defaultFill,
        pointerTime: 250,
        pointerPrice: 5,
      }),
    )
    assert.equal(resizeModels.length, 2)
    assert.equal(resizeModels[0].fillStyle, resolveRectangleInstanceFillStyle(other))
    assert.equal(resizeModels[1].fillStyle, 'rgba(255, 0, 0, 0.5)')

    const moveModels = buildRectangleDrawModels(
      sharedArgs({
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
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        previewFillStyle: defaultFill,
        pointerTime: 250,
        pointerPrice: 5,
      }),
    )
    assert.equal(moveModels.length, 1)
    assert.equal(moveModels[0].fillStyle, resolveRectangleInstanceFillStyle(faded))

    const creating = startRectangleCreateDraft(
      armRectangleTool({ phase: 'inactive', selectedId: null, draft: null }),
      100,
      10,
    )
    const createModels = buildRectangleDrawModels(
      sharedArgs({
        instances: [colored],
        interaction: creating,
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        previewFillStyle: defaultFill,
        pointerTime: 250,
        pointerPrice: 5,
      }),
    )
    assert.equal(createModels.at(-1)?.fillStyle, defaultFill)
  })
})

describe('rectangleHandleKindFromDrawIndex', () => {
  it('documents the full eight-slot layout; clipped models carry a subset', () => {
    assert.deepEqual(
      Array.from({ length: 8 }, (_, index) => rectangleHandleKindFromDrawIndex(index)),
      [
        'corner-nw',
        'edge-n',
        'corner-ne',
        'edge-e',
        'corner-se',
        'edge-s',
        'corner-sw',
        'edge-w',
      ],
    )
    assert.equal(rectangleHandleKindFromDrawIndex(8), null)
    // `buildRectangleDrawModels` filters clipped-side handles out of
    // `model.handles`, so the helper's index is a full-layout slot number, not
    // a model handle index once either edge is clipped.
    const instance = {
      ...createRectangleInstance({
        fromTime: 1000,
        toTime: 2000,
        lowPrice: 10,
        highPrice: 20,
      })!,
      fillColor: '#ff0000',
      fillOpacity: 100,
    }
    const clipped = buildRectangleDrawModels({
      instances: [instance],
      interaction: { phase: 'inactive', selectedId: instance.id, draft: null },
      resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
      previewFillStyle: 'rgba(0,0,0,0.2)',
      handleFillStyle: 'rgba(0,0,0,0.8)',
      pointerTime: null,
      pointerPrice: null,
      projectTime: (time) => ({
        coordinate: time < 1500 ? 1500 : time,
        clippedBeforeLoadedHistory: time < 1500,
      }),
      priceToY: (price) => 100 - price,
      handleRadiusPx: 4,
    })
    assert.equal(clipped.length, 1)
    assert.equal(clipped[0].handles.length, 5)
    // Full-layout order with the three start-side slots removed.
    assert.deepEqual(
      clipped[0].handles,
      [
        { x: 1750, y: 80 },
        { x: 2000, y: 80 },
        { x: 2000, y: 85 },
        { x: 2000, y: 90 },
        { x: 1750, y: 90 },
      ],
    )
  })
})

describe('rectangleRenderGeometry visible part before loaded history', () => {
  const clippedInstance = () =>
    ({
      ...createRectangleInstance({
        fromTime: 1000,
        toTime: 2000,
        lowPrice: 10,
        highPrice: 20,
      })!,
      fillColor: '#ff0000',
      fillOpacity: 100,
    })

  it('paints the loaded-history part without a handle on the clipped start', () => {
    const instance = clippedInstance()
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction: { phase: 'inactive', selectedId: instance.id, draft: null },
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
      }),
    )
    assert.equal(models.length, 1)
    const model = models[0]
    assert.deepEqual(
      { left: model.left, right: model.right, top: model.top, bottom: model.bottom },
      {
        left: LOADED_EDGE_COORDINATE,
        right: 2000,
        top: 80,
        bottom: 90,
      },
    )
    assert.equal(model.clippedStart, true)
    assert.equal(model.clippedEnd, false)
    assert.equal(model.fillStyle, '#ff0000')
    // Only the loaded-history edges carry handles: no corner-nw, edge-w or
    // corner-sw at the shared earliest-loaded-bar coordinate.
    assert.deepEqual(model.handles, [
      { x: 1750, y: 80 },
      { x: 2000, y: 80 },
      { x: 2000, y: 85 },
      { x: 2000, y: 90 },
      { x: 1750, y: 90 },
    ])
  })

  it('matches the same box anchored exactly on the loaded edge', () => {
    const anchored = {
      ...clippedInstance(),
      fromTime: LOADED_EDGE_COORDINATE,
    }
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [anchored],
        interaction: { phase: 'inactive', selectedId: anchored.id, draft: null },
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
      }),
    )
    assert.equal(models.length, 1)
    const model = models[0]
    assert.deepEqual(
      { left: model.left, right: model.right, top: model.top, bottom: model.bottom },
      {
        left: LOADED_EDGE_COORDINATE,
        right: 2000,
        top: 80,
        bottom: 90,
      },
    )
    assert.equal(model.clippedStart, false)
    assert.equal(model.fillStyle, '#ff0000')
    assert.equal(model.handles.length, 8)
  })

  it('keeps an unselected clipped box filled and handle-free', () => {
    const instance = clippedInstance()
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction: { phase: 'inactive', selectedId: null, draft: null },
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
      }),
    )
    assert.equal(models.length, 1)
    assert.equal(models[0].handles.length, 0)
  })

  it('keeps locked and hidden states unchanged for a clipped box', () => {
    const locked = setRectangleInstanceLocked(clippedInstance(), true)
    const hidden = { ...clippedInstance(), id: 'rect-hidden', hidden: true }
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [locked, hidden],
        interaction: { phase: 'inactive', selectedId: locked.id, draft: null },
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
      }),
    )
    assert.equal(models.length, 1)
    assert.equal(models[0].handles.length, 0)
  })

  it('keeps a zero-opacity clipped box geometric and unpainted-looking', () => {
    const instance = {
      ...clippedInstance(),
      fillOpacity: 0,
    }
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction: { phase: 'inactive', selectedId: instance.id, draft: null },
        resolveInstanceFillStyle: resolveRectangleInstanceFillStyle,
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
      }),
    )
    assert.equal(models.length, 1)
    assert.equal(models[0].fillStyle, 'rgba(255, 0, 0, 0)')
    assert.equal(models[0].left, LOADED_EDGE_COORDINATE)
    assert.equal(models[0].handles.length, 5)
  })

  it('draws nothing for a box that lies entirely before the loaded history', () => {
    const instance = createRectangleInstance({
      fromTime: 10,
      toTime: 900,
      lowPrice: 10,
      highPrice: 20,
    })!
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction: { phase: 'inactive', selectedId: instance.id, draft: null },
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
      }),
    )
    assert.equal(models.length, 0)
  })

  it('keeps the stored drag anchor while moving a clipped box', () => {
    const instance = clippedInstance()
    const initialBounds = {
      fromTime: instance.fromTime,
      toTime: instance.toTime,
      lowPrice: instance.lowPrice,
      highPrice: instance.highPrice,
    }
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction: {
          phase: 'moving',
          selectedId: instance.id,
          draft: {
            kind: 'move',
            instanceId: instance.id,
            initialBounds,
            anchorTime: 1600,
            anchorPrice: 15,
          },
        },
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
        pointerTime: 1700,
        pointerPrice: 16,
      }),
    )
    assert.equal(models.length, 1)
    // Preview moved by +100s: still clipped at the loaded edge, not re-anchored.
    assert.equal(models[0].right, 2100)
    assert.equal(models[0].left, LOADED_EDGE_COORDINATE)
    assert.equal(models[0].clippedStart, true)
    assert.deepEqual(initialBounds, {
      fromTime: 1000,
      toTime: 2000,
      lowPrice: 10,
      highPrice: 20,
    })
  })

  it('projects an inverted price scale with the same time geometry', () => {
    const instance = clippedInstance()
    const models = buildRectangleDrawModels(
      sharedArgs({
        instances: [instance],
        interaction: { phase: 'inactive', selectedId: null, draft: null },
        projectTime: clipAtLoadedEdge(LOADED_EDGE_COORDINATE),
        // Log/inverted APIs are not offered by the panel; the geometry must only
        // depend on the price coordinate the scale reports.
        priceToY: (price) => Math.log(price) * 10,
      }),
    )
    assert.equal(models.length, 1)
    assert.equal(models[0].left, LOADED_EDGE_COORDINATE)
    assert.equal(models[0].right, 2000)
    assert.ok(models[0].top < models[0].bottom)
  })
})
