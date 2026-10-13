import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hitTestAnchoredVwapDrawings } from './anchoredVwapDrawingHitTest.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { createDefaultAnchoredVwapDrawingSettings } from './anchoredVwapDrawingSettings.ts'

function makeInstance(id: string, displaySequence: number): AnchoredVwapInstance {
  return {
    id,
    anchorTime: 1_700_000_000,
    displaySequence,
    settings: createDefaultAnchoredVwapDrawingSettings(),
  }
}

const instances: AnchoredVwapInstance[] = [
  makeInstance('avwap-old', 1),
  makeInstance('avwap-new', 2),
]

function project(instance: AnchoredVwapInstance) {
  if (instance.id === 'avwap-old') {
    return {
      anchorX: null,
      anchorY: null,
      bodySegments: [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
    }
  }
  return {
    anchorX: null,
    anchorY: null,
    bodySegments: [{ x1: 20, y1: 20, x2: 80, y2: 80 }],
  }
}

describe('anchoredVwapDrawingHitTest', () => {
  it('chooses the newest anchored VWAP for overlapping body hits', () => {
    const hit = hitTestAnchoredVwapDrawings(instances, null, 50, 50, project)
    assert.equal(hit?.kind, 'body')
    assert.equal(hit?.instanceId, 'avwap-new')
  })
})
