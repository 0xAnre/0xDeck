import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clearDrawingSelections,
  clearFixedRangeVolumeProfileSelectionForPeerClaim,
  clearLineAndRectangleSelectionForFrvpClaim,
  releaseAnchoredVwapDrawingInteractionForPeerTool,
  releaseFixedRangeVolumeProfileInteractionForPeerTool,
  releaseLineInteractionForPeerTool,
  releaseRectangleInteractionForPeerTool,
  withExclusiveFrvpSelection,
  withExclusiveLineSelection,
  withExclusiveRectangleSelection,
} from './drawingSelection.ts'
import {
  armAnchoredVwapDrawingTool,
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  startAnchoredVwapAnchorDrag,
} from './anchoredVwapDrawingInteraction.ts'
import {
  cancelFixedRangeVolumeProfileInteraction,
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
} from './fixedRangeVolumeProfileInteraction.ts'
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
    const selectedFrvp = { ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE, selectedId: 'frvp-1' }
    const lineClaim = withExclusiveLineSelection(movingLine, selectedRectangle, selectedFrvp)
    assert.equal(lineClaim.line.selectedId, line.id)
    assert.equal(lineClaim.rectangle.selectedId, null)
    assert.equal(lineClaim.frvp.selectedId, null)

    const selectedLine = { ...INITIAL_LINE_INTERACTION_STATE, selectedId: line.id }
    const movingRectangle = startRectangleMoveDraft(
      INITIAL_RECTANGLE_INTERACTION_STATE,
      rectangle,
      1_700_000_100,
      1.5,
    )
    const rectangleClaim = withExclusiveRectangleSelection(
      movingRectangle,
      selectedLine,
      selectedFrvp,
    )
    assert.equal(rectangleClaim.rectangle.selectedId, rectangle.id)
    assert.equal(rectangleClaim.line.selectedId, null)
    assert.equal(rectangleClaim.frvp.selectedId, null)
  })

  it('clears line and rectangle selection when FRVP claims the pointer', () => {
    const selectedLine = { ...INITIAL_LINE_INTERACTION_STATE, selectedId: 'line-1' }
    const selectedRectangle = {
      ...INITIAL_RECTANGLE_INTERACTION_STATE,
      selectedId: 'rect-1',
    }
    const selectedFrvp = { ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE, selectedId: 'frvp-1' }
    const claim = withExclusiveFrvpSelection(selectedFrvp, selectedLine, selectedRectangle)
    assert.equal(claim.frvp.selectedId, 'frvp-1')
    assert.equal(claim.line.selectedId, null)
    assert.equal(claim.rectangle.selectedId, null)
  })

  it('releases FRVP selection when arming a peer drawing tool', () => {
    const selectedFrvp = {
      ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      selectedId: 'frvp-1',
    }
    const released = releaseFixedRangeVolumeProfileInteractionForPeerTool(selectedFrvp)
    assert.equal(released.selectedId, null)
    assert.equal(released.phase, 'inactive')
  })

  it('releases armed FRVP when arming a peer drawing tool', () => {
    const armedFrvp = {
      ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      phase: 'armed' as const,
      selectedId: null,
      draft: null,
    }
    const released = releaseFixedRangeVolumeProfileInteractionForPeerTool(armedFrvp)
    assert.equal(released.phase, 'inactive')
    assert.equal(released.selectedId, null)
  })

  it('clears FRVP selection for peer claim without disturbing armed tool state', () => {
    const selectedFrvp = {
      ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      selectedId: 'frvp-1',
    }
    const cleared = clearFixedRangeVolumeProfileSelectionForPeerClaim(selectedFrvp)
    assert.equal(cleared.selectedId, null)
    assert.equal(cleared.phase, 'inactive')
  })

  it('clears inactive FRVP selection when arming a peer drawing tool', () => {
    const selectedFrvp = {
      ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      selectedId: 'frvp-1',
    }
    const released = clearFixedRangeVolumeProfileSelectionForPeerClaim(
      cancelFixedRangeVolumeProfileInteraction(selectedFrvp),
    )
    assert.equal(released.selectedId, null)
    assert.equal(released.phase, 'inactive')
  })

  it('clears line and rectangle when FRVP claims the pointer', () => {
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
    const peers = clearLineAndRectangleSelectionForFrvpClaim(
      { ...INITIAL_LINE_INTERACTION_STATE, selectedId: line.id },
      { ...INITIAL_RECTANGLE_INTERACTION_STATE, selectedId: rectangle.id },
    )
    assert.equal(peers.line.selectedId, null)
    assert.equal(peers.rectangle.selectedId, null)
  })

  it('clears line and rectangle selection when arming FRVP from a peer tool', () => {
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
    const releasedLine = releaseLineInteractionForPeerTool({
      ...INITIAL_LINE_INTERACTION_STATE,
      selectedId: line.id,
    })
    const releasedRectangle = releaseRectangleInteractionForPeerTool({
      ...INITIAL_RECTANGLE_INTERACTION_STATE,
      selectedId: rectangle.id,
    })
    assert.equal(releasedLine.selectedId, null)
    assert.equal(releasedRectangle.selectedId, null)
  })

  it('clears anchored VWAP phase and selection when arming a peer tool', () => {
    const selected = {
      ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
      selectedId: 'anchored-vwap-1',
    }
    const released = releaseAnchoredVwapDrawingInteractionForPeerTool(selected)
    assert.equal(released.phase, 'inactive')
    assert.equal(released.selectedId, null)

    const armed = armAnchoredVwapDrawingTool(selected)
    const releasedArmed = releaseAnchoredVwapDrawingInteractionForPeerTool(armed)
    assert.equal(releasedArmed.phase, 'inactive')
    assert.equal(releasedArmed.selectedId, null)

    const dragging = startAnchoredVwapAnchorDrag(selected, 'anchored-vwap-1', 100)
    const releasedDragging = releaseAnchoredVwapDrawingInteractionForPeerTool(dragging)
    assert.equal(releasedDragging.phase, 'inactive')
    assert.equal(releasedDragging.selectedId, null)
    assert.equal(releasedDragging.draft, null)
  })
})

describe('clearDrawingSelections', () => {
  it('deselects every drawing tool at once', () => {
    const states = {
      rectangle: { ...INITIAL_RECTANGLE_INTERACTION_STATE, selectedId: 'rect-1' },
      line: { ...INITIAL_LINE_INTERACTION_STATE, selectedId: 'line-1' },
      fixedRangeVolumeProfile: {
        ...INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
        selectedId: 'frvp-1',
      },
      anchoredVwap: {
        ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
        selectedId: 'avwap-1',
      },
    }

    const cleared = clearDrawingSelections(states)
    assert.ok(cleared)
    assert.equal(cleared.rectangle.selectedId, null)
    assert.equal(cleared.line.selectedId, null)
    assert.equal(cleared.fixedRangeVolumeProfile.selectedId, null)
    assert.equal(cleared.anchoredVwap.selectedId, null)
    // The original states are untouched: instances are not selection state.
    assert.equal(states.rectangle.selectedId, 'rect-1')
    assert.equal(states.line.selectedId, 'line-1')
  })

  it('is a no-op when nothing is selected', () => {
    const states = {
      rectangle: INITIAL_RECTANGLE_INTERACTION_STATE,
      line: INITIAL_LINE_INTERACTION_STATE,
      fixedRangeVolumeProfile: INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      anchoredVwap: INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
    }
    // `null` (unchanged) lets the caller skip a re-render.
    assert.equal(clearDrawingSelections(states), null)
  })

  it('keeps an armed tool and an in-progress gesture untouched', () => {
    const armedLine = armLineTool(INITIAL_LINE_INTERACTION_STATE)
    const rectangleInstance = createRectangleInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_300,
      lowPrice: 1,
      highPrice: 2,
    })!
    const movingRectangle = startRectangleMoveDraft(
      { ...INITIAL_RECTANGLE_INTERACTION_STATE, selectedId: rectangleInstance.id },
      rectangleInstance,
      1_700_000_100,
      1.5,
    )
    const draggingAnchor = startAnchoredVwapAnchorDrag(
      { ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE, selectedId: 'avwap-1' },
      'avwap-1',
      1_700_000_000,
    )

    const cleared = clearDrawingSelections({
      rectangle: movingRectangle,
      line: armedLine,
      fixedRangeVolumeProfile: INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      anchoredVwap: draggingAnchor,
    })
    assert.ok(cleared)
    // The armed line tool stays armed, so its draft is not cancelled mid-gesture.
    assert.equal(cleared.line.phase, 'armed')
    // A move draft in progress is preserved by `applyRectangleSelection`.
    assert.equal(cleared.rectangle.phase, 'moving')
    assert.equal(cleared.rectangle.selectedId, rectangleInstance.id)
    assert.equal(cleared.anchoredVwap.phase, 'dragging-anchor')
  })
})
