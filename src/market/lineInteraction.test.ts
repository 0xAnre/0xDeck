import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  armLineTool,
  cancelLineInteraction,
  commitLineCreate,
  commitLineMove,
  commitLineResize,
  INITIAL_LINE_INTERACTION_STATE,
  isLineChartNavigationLocked,
  previewEndpointsFromInteraction,
  removeSelectedLine,
  startLineCreateDraft,
  startLineMoveDraft,
  updateLineCreatePreview,
} from './lineInteraction.ts'
import { createLineInstance } from './lineInstances.ts'

describe('lineInteraction', () => {
  it('creates, cancels, and deletes lines', () => {
    const armed = armLineTool(INITIAL_LINE_INTERACTION_STATE)
    const creating = startLineCreateDraft(armed, 100, 10)
    const preview = updateLineCreatePreview(creating, 120, 20)
    const created = commitLineCreate(preview, [])
    assert.notEqual(created.completedInstance, null)
    assert.equal(created.state.selectedId, created.completedInstance?.id)

    const cancelled = cancelLineInteraction(startLineCreateDraft(armLineTool(INITIAL_LINE_INTERACTION_STATE), 1, 1))
    assert.equal(cancelled.phase, 'inactive')

    const withSelection = { ...INITIAL_LINE_INTERACTION_STATE, selectedId: created.completedInstance!.id }
    const removed = removeSelectedLine(withSelection, [created.completedInstance!])
    assert.equal(removed.instances.length, 0)
  })

  it('commits endpoint resize and whole-line move', () => {
    const instance = createLineInstance({
      timeA: 100,
      priceA: 10,
      timeB: 200,
      priceB: 20,
    })!
    const resizing = {
      phase: 'resizing' as const,
      selectedId: instance.id,
      draft: {
        kind: 'resize' as const,
        instanceId: instance.id,
        endpoint: 'endpoint-b' as const,
        initialEndpoints: {
          timeA: instance.timeA,
          priceA: instance.priceA,
          timeB: instance.timeB,
          priceB: instance.priceB,
        },
      },
    }
    const resized = commitLineResize(resizing, [instance], 250, 5)
    assert.equal(resized.updatedInstance?.timeB, 250)
    assert.equal(resized.updatedInstance?.priceB, 5)

    const moving = startLineMoveDraft(INITIAL_LINE_INTERACTION_STATE, instance, 150, 15)
    assert.equal(isLineChartNavigationLocked(moving), true)
    const preview = previewEndpointsFromInteraction(moving, 180, 18)
    assert.deepEqual(preview, {
      timeA: 130,
      priceA: 13,
      timeB: 230,
      priceB: 23,
    })
    const moved = commitLineMove(moving, [instance], 180, 18)
    assert.equal(moved.updatedInstance?.timeA, 130)
  })

  it('rejects zero-length create commits', () => {
    const armed = armLineTool(INITIAL_LINE_INTERACTION_STATE)
    const creating = startLineCreateDraft(armed, 100, 10)
    const flat = updateLineCreatePreview(creating, 100, 10)
    const result = commitLineCreate(flat, [])
    assert.equal(result.completedInstance, null)
    assert.equal(result.state.phase, 'armed')
  })
})
