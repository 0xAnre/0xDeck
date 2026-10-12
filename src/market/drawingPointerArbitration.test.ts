import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  preferDrawingPointerTarget,
  preferDrawingPointerTargetAmongPeers,
} from './drawingPointerArbitration.ts'
import type { FixedRangeVolumeProfileHitTarget } from './fixedRangeVolumeProfileHitTest.ts'
import type { LineHitTarget } from './lineHitTest.ts'
import type { RectangleHitTarget } from './rectangleHitTest.ts'

function lineHit(kind: LineHitTarget['kind']): LineHitTarget {
  return { instanceId: 'line-1', kind, priority: 1, instanceIndex: 0 }
}

function rectangleHit(kind: RectangleHitTarget['kind']): RectangleHitTarget {
  return { instanceId: 'rect-1', kind, priority: 1, instanceIndex: 0 }
}

function frvpHit(kind: FixedRangeVolumeProfileHitTarget['kind']): FixedRangeVolumeProfileHitTarget {
  return { instanceId: 'frvp-1', kind, priority: 1, instanceIndex: 0 }
}

describe('preferDrawingPointerTarget', () => {
  it('lets a line stroke win over a rectangle fill', () => {
    assert.equal(preferDrawingPointerTarget(lineHit('body'), rectangleHit('interior')), 'line')
    assert.equal(
      preferDrawingPointerTarget(lineHit('endpoint-a'), rectangleHit('interior')),
      'line',
    )
  })

  it('keeps a lone rectangle hit and a selected rectangle edge', () => {
    assert.equal(preferDrawingPointerTarget(null, rectangleHit('interior')), 'rectangle')
    assert.equal(preferDrawingPointerTarget(lineHit('body'), rectangleHit('edge-n')), 'rectangle')
    assert.equal(preferDrawingPointerTarget(lineHit('body'), null), 'line')
  })

  it('prefers the line when handle specificity ties', () => {
    assert.equal(
      preferDrawingPointerTarget(lineHit('endpoint-b'), rectangleHit('corner-se')),
      'line',
    )
  })
})

describe('preferDrawingPointerTargetAmongPeers', () => {
  it('lets line and rectangle beat FRVP body hits', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(lineHit('body'), rectangleHit('interior'), frvpHit('body')),
      'line',
    )
    assert.equal(
      preferDrawingPointerTargetAmongPeers(null, rectangleHit('interior'), frvpHit('body')),
      'rectangle',
    )
  })

  it('lets FRVP endpoint beat rectangle interior', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(null, rectangleHit('interior'), frvpHit('end')),
      'frvp',
    )
  })

  it('prefers line over FRVP endpoint when specificity ties', () => {
    assert.equal(
      preferDrawingPointerTargetAmongPeers(lineHit('endpoint-a'), null, frvpHit('start')),
      'line',
    )
  })
})
