import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  releaseLineInteractionForPeerTool,
  releaseRectangleInteractionForPeerTool,
  withExclusiveLineSelection,
  withExclusiveRectangleSelection,
} from './drawingSelection.ts'
import {
  armLineTool,
  commitLineCreate,
  INITIAL_LINE_INTERACTION_STATE,
  removeSelectedLine,
  startLineCreateDraft,
  startLineMoveDraft,
  updateLineCreatePreview,
} from './lineInteraction.ts'
import { createLineInstance } from './lineInstances.ts'
import {
  armRectangleTool,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  removeSelectedRectangle,
  startRectangleMoveDraft,
} from './rectangleInteraction.ts'
import { createRectangleInstance } from './rectangleInstances.ts'

describe('drawingSelection', () => {
  it('clears the rectangle selection when Line is armed and then drawn', () => {
    const rectangle = createRectangleInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_300,
      lowPrice: 1,
      highPrice: 2,
    })!
    const selectedRectangle = {
      ...INITIAL_RECTANGLE_INTERACTION_STATE,
      selectedId: rectangle.id,
    }
    const armed = armLineTool(
      releaseLineInteractionForPeerTool(INITIAL_LINE_INTERACTION_STATE),
    )
    const releasedRectangle = releaseRectangleInteractionForPeerTool(selectedRectangle)
    assert.equal(releasedRectangle.selectedId, null)
    assert.equal(releasedRectangle.phase, 'inactive')
    assert.equal(armed.phase, 'armed')

    const created = commitLineCreate(
      updateLineCreatePreview(startLineCreateDraft(armed, 100, 10), 160, 20),
      [],
    )
    const exclusive = withExclusiveLineSelection(created.state, releasedRectangle)
    assert.equal(exclusive.line.selectedId, created.completedInstance?.id)
    assert.equal(exclusive.rectangle.selectedId, null)

    const deletedLine = removeSelectedLine(exclusive.line, [created.completedInstance!])
    const deletedRectangle = removeSelectedRectangle(exclusive.rectangle, [rectangle])
    assert.equal(deletedLine.instances.length, 0)
    assert.equal(deletedRectangle.instances.length, 1)
  })

  it('clears the line selection when Rectangle is armed', () => {
    const line = createLineInstance({
      timeA: 100,
      priceA: 10,
      timeB: 200,
      priceB: 20,
    })!
    const selectedLine = { ...INITIAL_LINE_INTERACTION_STATE, selectedId: line.id }
    const releasedLine = releaseLineInteractionForPeerTool(selectedLine)
    const armed = armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE)
    assert.equal(releasedLine.selectedId, null)
    assert.equal(armed.phase, 'armed')
    const deletedLine = removeSelectedLine(releasedLine, [line])
    assert.equal(deletedLine.instances.length, 1)
  })

  it('clears the peer selection when a line or rectangle claims the pointer', () => {
    const line = createLineInstance({
      timeA: 100,
      priceA: 10,
      timeB: 200,
      priceB: 20,
    })!
    const rectangle = createRectangleInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_300,
      lowPrice: 1,
      highPrice: 2,
    })!
    const selectedRectangle = {
      ...INITIAL_RECTANGLE_INTERACTION_STATE,
      selectedId: rectangle.id,
    }
    const movingLine = startLineMoveDraft(INITIAL_LINE_INTERACTION_STATE, line, 150, 15)
    const lineClaim = withExclusiveLineSelection(movingLine, selectedRectangle)
    assert.equal(lineClaim.line.selectedId, line.id)
    assert.equal(lineClaim.rectangle.selectedId, null)

    const selectedLine = { ...INITIAL_LINE_INTERACTION_STATE, selectedId: line.id }
    const movingRectangle = startRectangleMoveDraft(
      INITIAL_RECTANGLE_INTERACTION_STATE,
      rectangle,
      1_700_000_100,
      1.5,
    )
    const rectangleClaim = withExclusiveRectangleSelection(movingRectangle, selectedLine)
    assert.equal(rectangleClaim.rectangle.selectedId, rectangle.id)
    assert.equal(rectangleClaim.line.selectedId, null)
  })
})
