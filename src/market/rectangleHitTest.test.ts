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
})
