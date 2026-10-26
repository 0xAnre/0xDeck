import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isLineStyleDraftPatchEmpty,
  lineStyleDraftFromInstance,
  lineStyleDraftPatch,
  sanitizeLineStyleDraft,
} from './lineStyleDraft.ts'
import type { LineInstance } from '../market/lineInstances.ts'
import {
  DEFAULT_LINE_CHART_STROKE_STYLE,
  DEFAULT_LINE_CHART_STROKE_WIDTH,
} from '../market/lineChartStroke.ts'
import { MARKET_STYLE_DEFAULTS } from '../market/marketStylePalette.ts'
import { LINE_DEFAULT_STROKE_OPACITY_PERCENT } from '../market/lineColors.ts'

function lineInstance(overrides: Partial<LineInstance> = {}): LineInstance {
  return {
    id: 'line-abcd1234',
    timeA: 1_700_000_000,
    priceA: 100,
    timeB: 1_700_003_600,
    priceB: 110,
    displaySequence: 1,
    ...overrides,
  }
}

describe('lineStyleDraftFromInstance', () => {
  it('resolves palette defaults for an instance without custom styling', () => {
    const draft = lineStyleDraftFromInstance(lineInstance())
    assert.equal(draft.color, MARKET_STYLE_DEFAULTS.primaryLine.color)
    assert.equal(draft.opacityPercent, LINE_DEFAULT_STROKE_OPACITY_PERCENT)
    assert.equal(draft.lineWidth, DEFAULT_LINE_CHART_STROKE_WIDTH)
    assert.equal(draft.lineStyle, DEFAULT_LINE_CHART_STROKE_STYLE)
  })

  it('reads stored styling values', () => {
    const draft = lineStyleDraftFromInstance(
      lineInstance({
        strokeColor: '#112233',
        strokeOpacity: 40,
        lineWidth: 3,
        lineStyle: 'dotted',
      }),
    )
    assert.deepEqual(draft, {
      color: '#112233',
      opacityPercent: 40,
      lineWidth: 3,
      lineStyle: 'dotted',
    })
  })
})

describe('lineStyleDraftPatch', () => {
  it('produces no commit for an untouched draft', () => {
    const initial = lineStyleDraftFromInstance(lineInstance())
    const patch = lineStyleDraftPatch(initial, { ...initial })
    assert.deepEqual(patch, {})
    assert.equal(isLineStyleDraftPatchEmpty(patch), true)
  })

  it('commits exactly the changed fields', () => {
    const initial = lineStyleDraftFromInstance(lineInstance())
    const patch = lineStyleDraftPatch(initial, {
      ...initial,
      opacityPercent: 55,
      lineStyle: 'dotted',
    })
    assert.deepEqual(patch, { strokeOpacity: 55, lineStyle: 'dotted' })
    assert.equal(isLineStyleDraftPatchEmpty(patch), false)
  })

  it('maps every changed field to its instance setter value', () => {
    const initial = lineStyleDraftFromInstance(lineInstance())
    const patch = lineStyleDraftPatch(initial, {
      color: '#AABBCC',
      opacityPercent: 10,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
    assert.deepEqual(patch, {
      strokeColor: '#AABBCC',
      strokeOpacity: 10,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
  })

  it('discarding an edited draft produces no commit and re-opens saved values', () => {
    const instance = lineInstance({ strokeColor: '#112233', lineWidth: 2 })
    const snapshot = { ...instance }
    const initial = lineStyleDraftFromInstance(instance)
    const edited = { ...initial, color: '#445566', lineWidth: 4 as const }

    // Cancel / X / Esc / outside click drop `edited` without calling any handler.
    assert.notDeepEqual(edited, initial)
    assert.deepEqual(instance, snapshot)
    assert.deepEqual(lineStyleDraftPatch(initial, initial), {})
    // Re-opening re-initializes from stored values, never from the stale draft.
    assert.deepEqual(lineStyleDraftFromInstance(instance), initial)
  })
})

describe('sanitizeLineStyleDraft', () => {
  it('keeps valid values intact', () => {
    const initial = lineStyleDraftFromInstance(lineInstance())
    const draft = {
      color: '#0F0F0F',
      opacityPercent: 0,
      lineWidth: 4 as const,
      lineStyle: 'dotted' as const,
    }
    assert.deepEqual(sanitizeLineStyleDraft(initial, draft), draft)
  })

  it('falls back to the opened values for invalid stored-legacy values', () => {
    const initial = lineStyleDraftFromInstance(lineInstance())
    const sanitized = sanitizeLineStyleDraft(initial, {
      color: 'red',
      opacityPercent: 140,
      lineWidth: 7 as never,
      lineStyle: 'dashed' as never,
    })
    assert.deepEqual(sanitized, initial)
  })
})
