import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hitTestLines } from './lineHitTest.ts'
import type { LineInstance } from './lineInstances.ts'

const instances: LineInstance[] = [
  { id: 'line-old', timeA: 1, priceA: 1, timeB: 2, priceB: 2 },
  { id: 'line-new', timeA: 1, priceA: 1, timeB: 2, priceB: 2 },
]

function project(instance: LineInstance) {
  if (instance.id === 'line-old') {
    return { ax: 0, ay: 0, bx: 100, by: 100 }
  }
  return { ax: 20, ay: 20, bx: 80, by: 80 }
}

describe('lineHitTest', () => {
  it('prefers endpoint handles over body', () => {
    const hit = hitTestLines(instances, 'line-new', 20, 20, project)
    assert.equal(hit?.kind, 'endpoint-a')
    assert.equal(hit?.instanceId, 'line-new')
  })

  it('chooses the newest line for overlapping body hits', () => {
    const hit = hitTestLines(instances, null, 50, 50, project)
    assert.equal(hit?.kind, 'body')
    assert.equal(hit?.instanceId, 'line-new')
  })
})
