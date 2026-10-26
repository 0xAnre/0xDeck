import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DRAWING_CURSOR_CROSSHAIR,
  DRAWING_CURSOR_DEFAULT,
  DRAWING_CURSOR_EW_RESIZE,
  DRAWING_CURSOR_GRAB,
  DRAWING_CURSOR_MOVE,
  DRAWING_CURSOR_NESW_RESIZE,
  DRAWING_CURSOR_NS_RESIZE,
  DRAWING_CURSOR_NWSE_RESIZE,
  DRAWING_CURSOR_POINTER,
  releaseDrawingCursor,
  resolveDrawingCursor,
  updateDrawingCursor,
  type DrawingCursorHandleKind,
} from './drawingCursor.ts'

function fakePaneElement(): HTMLElement {
  return { style: { cursor: '' } } as unknown as HTMLElement
}

describe('resolveDrawingCursor', () => {
  it('uses the neutral cursor for empty pane space and missing targets', () => {
    assert.equal(resolveDrawingCursor(null), DRAWING_CURSOR_DEFAULT)
    assert.equal(resolveDrawingCursor(undefined), DRAWING_CURSOR_DEFAULT)
  })

  it('maps movable bodies to move and static bodies to pointer', () => {
    assert.equal(resolveDrawingCursor({ kind: 'interior' }), DRAWING_CURSOR_MOVE)
    assert.equal(resolveDrawingCursor({ kind: 'body' }), DRAWING_CURSOR_MOVE)
    assert.equal(
      resolveDrawingCursor({ kind: 'body', movable: false }),
      DRAWING_CURSOR_POINTER,
    )
  })

  it('maps rectangle corner and edge handles to the matching resize cursor', () => {
    const expected: Record<string, string> = {
      'corner-nw': DRAWING_CURSOR_NWSE_RESIZE,
      'corner-se': DRAWING_CURSOR_NWSE_RESIZE,
      'corner-ne': DRAWING_CURSOR_NESW_RESIZE,
      'corner-sw': DRAWING_CURSOR_NESW_RESIZE,
      'edge-n': DRAWING_CURSOR_NS_RESIZE,
      'edge-s': DRAWING_CURSOR_NS_RESIZE,
      'edge-e': DRAWING_CURSOR_EW_RESIZE,
      'edge-w': DRAWING_CURSOR_EW_RESIZE,
    }
    for (const [kind, cursor] of Object.entries(expected)) {
      assert.equal(resolveDrawingCursor({ kind: kind as DrawingCursorHandleKind }), cursor)
    }
  })

  it('maps line endpoints, FRVP range handles and VWAP anchors', () => {
    assert.equal(resolveDrawingCursor({ kind: 'endpoint-a' }), DRAWING_CURSOR_CROSSHAIR)
    assert.equal(resolveDrawingCursor({ kind: 'endpoint-b' }), DRAWING_CURSOR_CROSSHAIR)
    assert.equal(resolveDrawingCursor({ kind: 'start', movable: false }), DRAWING_CURSOR_EW_RESIZE)
    assert.equal(resolveDrawingCursor({ kind: 'end', movable: false }), DRAWING_CURSOR_EW_RESIZE)
    assert.equal(resolveDrawingCursor({ kind: 'anchor', movable: false }), DRAWING_CURSOR_GRAB)
  })

  it('never reports a move or resize cursor for locked objects', () => {
    const kinds: DrawingCursorHandleKind[] = [
      'interior',
      'body',
      'corner-nw',
      'corner-ne',
      'corner-se',
      'corner-sw',
      'edge-n',
      'edge-e',
      'edge-s',
      'edge-w',
      'endpoint-a',
      'endpoint-b',
      'anchor',
      'start',
      'end',
    ]
    for (const kind of kinds) {
      assert.equal(resolveDrawingCursor({ kind, locked: true }), DRAWING_CURSOR_POINTER)
      assert.equal(
        resolveDrawingCursor({ kind, locked: true, movable: false }),
        DRAWING_CURSOR_POINTER,
      )
    }
  })

  it('reports no hover cursor for hidden objects', () => {
    assert.equal(
      resolveDrawingCursor({ kind: 'corner-se', hidden: true }),
      DRAWING_CURSOR_DEFAULT,
    )
    assert.equal(
      resolveDrawingCursor({ kind: 'anchor', hidden: true, locked: false }),
      DRAWING_CURSOR_DEFAULT,
    )
  })
})

describe('pane drawing cursor requests', () => {
  it('applies the winner cursor and restores the default on release', () => {
    const element = fakePaneElement()
    updateDrawingCursor(element, 'rectangle', { kind: 'corner-se' })
    assert.equal(element.style.cursor, DRAWING_CURSOR_NWSE_RESIZE)
    updateDrawingCursor(element, 'line', null)
    updateDrawingCursor(element, 'fixed-range-volume-profile', null)
    assert.equal(element.style.cursor, DRAWING_CURSOR_NWSE_RESIZE)

    releaseDrawingCursor(element, 'rectangle')
    assert.equal(element.style.cursor, DRAWING_CURSOR_DEFAULT)
  })

  it('keeps the winner when another tool reports no hit afterwards', () => {
    const element = fakePaneElement()
    updateDrawingCursor(element, 'rectangle', { kind: 'interior' })
    updateDrawingCursor(element, 'line', null)
    updateDrawingCursor(element, 'anchored-vwap', { kind: 'body', movable: false })
    updateDrawingCursor(element, 'line', null)
    assert.equal(element.style.cursor, DRAWING_CURSOR_MOVE)

    releaseDrawingCursor(element, 'rectangle')
    assert.equal(element.style.cursor, DRAWING_CURSOR_POINTER)
  })

  it('is a no-op without a pane element and for unknown requests', () => {
    assert.doesNotThrow(() => {
      updateDrawingCursor(null, 'line', { kind: 'body' })
      releaseDrawingCursor(null, 'line')
    })

    const element = fakePaneElement()
    releaseDrawingCursor(element, 'line')
    assert.equal(element.style.cursor, '')
  })
})
