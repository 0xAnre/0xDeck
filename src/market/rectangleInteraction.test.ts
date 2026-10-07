import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyResizeHandleToBounds,
  armRectangleTool,
  cancelRectangleInteraction,
  commitRectangleCreate,
  commitRectangleMove,
  commitRectangleResize,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  isRectangleChartNavigationLocked,
  previewBoundsFromInteraction,
  removeSelectedRectangle,
  startRectangleCreateDraft,
  startRectangleMoveDraft,
  updateRectangleCreatePreview,
} from './rectangleInteraction.ts'
import { createRectangleInstance } from './rectangleInstances.ts'

describe('rectangleInteraction', () => {
  it('creates, cancels, and deletes rectangles', () => {
    const armed = armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE)
    const creating = startRectangleCreateDraft(armed, 100, 10)
    const preview = updateRectangleCreatePreview(creating, 120, 20)
    const created = commitRectangleCreate(preview, [])
    assert.notEqual(created.completedInstance, null)
    assert.equal(created.state.selectedId, created.completedInstance?.id)

    const cancelled = cancelRectangleInteraction(
      startRectangleCreateDraft(armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE), 1, 1),
    )
    assert.equal(cancelled.phase, 'inactive')

    const withSelection = { ...INITIAL_RECTANGLE_INTERACTION_STATE, selectedId: created.completedInstance!.id }
    const removed = removeSelectedRectangle(withSelection, [created.completedInstance!])
    assert.equal(removed.instances.length, 0)
  })

  it('commits resize with normalized bounds', () => {
    const instance = createRectangleInstance({
      fromTime: 100,
      toTime: 200,
      lowPrice: 10,
      highPrice: 20,
    })!
    const state = {
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
    const result = commitRectangleResize(state, [instance], 250, 5)
    assert.equal(result.updatedInstance?.fromTime, 100)
    assert.equal(result.updatedInstance?.toTime, 250)
    assert.equal(result.updatedInstance?.lowPrice, 5)
    assert.equal(result.updatedInstance?.highPrice, 20)
  })

  it('rejects zero-area create commits', () => {
    const armed = armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE)
    const creating = startRectangleCreateDraft(armed, 100, 10)
    const flat = updateRectangleCreatePreview(creating, 100, 10)
    const result = commitRectangleCreate(flat, [])
    assert.equal(result.completedInstance, null)
    assert.equal(result.state.phase, 'armed')
  })

  it('moves a box by translating both time and price while preserving size', () => {
    const instance = createRectangleInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_600,
      lowPrice: 10,
      highPrice: 20,
    })!
    const moving = startRectangleMoveDraft(
      INITIAL_RECTANGLE_INTERACTION_STATE,
      instance,
      1_700_000_300,
      15,
    )
    assert.equal(moving.phase, 'moving')
    const preview = previewBoundsFromInteraction(moving, 1_700_000_480, 18)
    assert.deepEqual(preview, {
      fromTime: 1_700_000_180,
      toTime: 1_700_000_780,
      lowPrice: 13,
      highPrice: 23,
    })
    const result = commitRectangleMove(moving, [instance], 1_700_000_480, 18)
    assert.equal(result.updatedInstance?.fromTime, 1_700_000_180)
    assert.equal(result.updatedInstance?.toTime, 1_700_000_780)
    assert.equal(result.updatedInstance?.toTime - result.updatedInstance!.fromTime, 600)
    assert.equal(result.updatedInstance!.highPrice - result.updatedInstance!.lowPrice, 10)
    assert.equal(isRectangleChartNavigationLocked(moving), true)
  })

  it('commits an unchanged move when the pointer does not shift', () => {
    const instance = createRectangleInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_600,
      lowPrice: 10,
      highPrice: 20,
    })!
    const moving = startRectangleMoveDraft(
      INITIAL_RECTANGLE_INTERACTION_STATE,
      instance,
      1_700_000_300,
      15,
    )
    const result = commitRectangleMove(moving, [instance], 1_700_000_300, 15)
    assert.deepEqual(result.updatedInstance, instance)
  })

  it('resizes edges on one axis only', () => {
    const bounds = applyResizeHandleToBounds(
      { fromTime: 100, toTime: 200, lowPrice: 10, highPrice: 20 },
      'edge-n',
      150,
      25,
    )
    assert.deepEqual(bounds, { fromTime: 100, toTime: 200, lowPrice: 10, highPrice: 25 })
  })
})
