import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isRectangleFillStyleDraftPatchEmpty,
  rectangleFillStyleDraftFromInstance,
  rectangleFillStyleDraftPatch,
  sanitizeRectangleFillStyleDraft,
} from './rectangleFillStyleDraft.ts'
import {
  DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT,
  type RectangleInstance,
} from '../market/rectangleInstances.ts'
import { DEFAULT_RECTANGLE_FILL_HEX } from '../market/rectangleInstances.ts'

function rectangleInstance(overrides: Partial<RectangleInstance> = {}): RectangleInstance {
  return {
    id: 'rect-abcd1234',
    fromTime: 1_700_000_000,
    toTime: 1_700_003_600,
    lowPrice: 100,
    highPrice: 110,
    displaySequence: 1,
    ...overrides,
  }
}

describe('rectangleFillStyleDraftFromInstance', () => {
  it('resolves palette defaults for an unstyled rectangle', () => {
    const draft = rectangleFillStyleDraftFromInstance(rectangleInstance())
    assert.equal(draft.fillColor, DEFAULT_RECTANGLE_FILL_HEX)
    assert.equal(draft.fillOpacityPercent, DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT)
  })

  it('reads stored fill values', () => {
    const draft = rectangleFillStyleDraftFromInstance(
      rectangleInstance({ fillColor: '#123456', fillOpacity: 25 }),
    )
    assert.deepEqual(draft, { fillColor: '#123456', fillOpacityPercent: 25 })
  })
})

describe('rectangleFillStyleDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = rectangleFillStyleDraftFromInstance(rectangleInstance())
    const patch = rectangleFillStyleDraftPatch(initial, { ...initial })
    assert.deepEqual(patch, {})
    assert.equal(isRectangleFillStyleDraftPatchEmpty(patch), true)
  })

  it('commits exactly the changed field', () => {
    const initial = rectangleFillStyleDraftFromInstance(rectangleInstance())
    assert.deepEqual(
      rectangleFillStyleDraftPatch(initial, { ...initial, fillOpacityPercent: 80 }),
      { fillOpacity: 80 },
    )
    assert.deepEqual(
      rectangleFillStyleDraftPatch(initial, { ...initial, fillColor: '#ABCDEF' }),
      { fillColor: '#ABCDEF' },
    )
  })

  it('discarding an edited draft produces no commit', () => {
    const instance = rectangleInstance({ fillColor: '#123456' })
    const snapshot = { ...instance }
    const initial = rectangleFillStyleDraftFromInstance(instance)
    const edited = { ...initial, fillOpacityPercent: 5 }

    assert.deepEqual(instance, snapshot)
    assert.deepEqual(rectangleFillStyleDraftPatch(initial, initial), {})
    assert.deepEqual(rectangleFillStyleDraftFromInstance(instance), initial)
    assert.notDeepEqual(edited, initial)
  })
})

describe('sanitizeRectangleFillStyleDraft', () => {
  it('falls back to opened values for invalid colors/opacities', () => {
    const initial = rectangleFillStyleDraftFromInstance(
      rectangleInstance({ fillColor: '#123456', fillOpacity: 25 }),
    )
    assert.deepEqual(
      sanitizeRectangleFillStyleDraft(initial, {
        fillColor: 'not-a-hex',
        fillOpacityPercent: 101,
      }),
      initial,
    )
  })

  it('accepts boundary opacities', () => {
    const initial = rectangleFillStyleDraftFromInstance(rectangleInstance())
    assert.deepEqual(
      sanitizeRectangleFillStyleDraft(initial, {
        fillColor: '#000000',
        fillOpacityPercent: 0,
      }),
      { fillColor: '#000000', fillOpacityPercent: 0 },
    )
  })
})
