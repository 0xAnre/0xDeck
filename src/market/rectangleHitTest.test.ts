import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hitTestRectangles } from './rectangleHitTest.ts'
import type { RectangleInstance } from './rectangleInstances.ts'

const instances: RectangleInstance[] = [
  { id: 'rect-old', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
  { id: 'rect-new', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
]

function project(instance: RectangleInstance) {
  if (instance.id === 'rect-old') {
    return { left: 0, right: 100, top: 0, bottom: 100 }
  }
  return { left: 20, right: 80, top: 20, bottom: 80 }
}

describe('rectangleHitTest', () => {
  it('prefers corners over edges and interior', () => {
    const hit = hitTestRectangles(instances, 'rect-new', 20, 20, project)
    assert.equal(hit?.kind, 'corner-nw')
    assert.equal(hit?.instanceId, 'rect-new')
  })

  it('chooses the newest rectangle for overlapping interior hits', () => {
    const hit = hitTestRectangles(instances, null, 50, 50, project)
    assert.equal(hit?.kind, 'interior')
    assert.equal(hit?.instanceId, 'rect-new')
  })

  it('prefers a corner hit over a newer interior hit', () => {
    const hit = hitTestRectangles(instances, 'rect-old', 0, 0, project, 8)
    assert.equal(hit?.kind, 'corner-nw')
    assert.equal(hit?.instanceId, 'rect-old')
  })

  it('has no start handle where the box was clipped at the loaded history', () => {
    const clipped: RectangleInstance[] = [
      { id: 'rect-clipped', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
    ]
    const projectClipped = () => ({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      clippedStart: true,
    })
    // The shared earliest-loaded-bar edge is not a real endpoint: a press there
    // never starts a west/corner (time) resize. The price-only top/bottom edges
    // behave exactly as they do on any other box.
    assert.equal(hitTestRectangles(clipped, 'rect-clipped', 0, 0, projectClipped)?.kind, 'edge-n')
    assert.equal(hitTestRectangles(clipped, 'rect-clipped', 0, 50, projectClipped)?.kind, 'interior')
    assert.equal(hitTestRectangles(clipped, 'rect-clipped', 0, 100, projectClipped)?.kind, 'edge-s')
    // Loaded-history handles and the interior still work.
    assert.equal(hitTestRectangles(clipped, 'rect-clipped', 100, 0, projectClipped)?.kind, 'corner-ne')
    assert.equal(hitTestRectangles(clipped, 'rect-clipped', 100, 50, projectClipped)?.kind, 'edge-e')
    assert.equal(hitTestRectangles(clipped, 'rect-clipped', 50, 50, projectClipped)?.kind, 'interior')
  })

  it('keeps east handles when only the end is clipped', () => {
    const clipped: RectangleInstance[] = [
      { id: 'rect-clipped-end', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
    ]
    const projectClipped = () => ({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      clippedEnd: true,
    })
    assert.equal(hitTestRectangles(clipped, 'rect-clipped-end', 0, 0, projectClipped)?.kind, 'corner-nw')
    assert.equal(hitTestRectangles(clipped, 'rect-clipped-end', 100, 0, projectClipped)?.kind, 'edge-n')
    assert.equal(hitTestRectangles(clipped, 'rect-clipped-end', 100, 100, projectClipped)?.kind, 'edge-s')
  })

  it('ignores a box that collapsed onto a single loaded edge', () => {
    const outside: RectangleInstance[] = [
      { id: 'rect-before-history', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 },
    ]
    const collapsed = () => ({ left: 40, right: 40, top: 0, bottom: 100 })
    assert.equal(hitTestRectangles(outside, 'rect-before-history', 40, 50, collapsed), null)
    assert.equal(hitTestRectangles(outside, null, 40, 50, collapsed), null)
  })

  it('ignores hidden handle targets on a selected locked rectangle', () => {
    const locked: RectangleInstance[] = [
      {
        id: 'rect-locked',
        fromTime: 1,
        toTime: 2,
        lowPrice: 1,
        highPrice: 2,
        locked: true,
      },
    ]
    const projectLocked = () => ({ left: 0, right: 100, top: 0, bottom: 100 })
    const outsideCorner = hitTestRectangles(locked, 'rect-locked', -4, -4, projectLocked)
    assert.equal(outsideCorner, null)
    const interior = hitTestRectangles(locked, 'rect-locked', 50, 50, projectLocked)
    assert.equal(interior?.kind, 'interior')
    assert.equal(interior?.instanceId, 'rect-locked')
  })
})
