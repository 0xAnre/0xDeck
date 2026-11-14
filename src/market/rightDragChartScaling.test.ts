import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RIGHT_DRAG_MAX_SPAN_FACTOR,
  RIGHT_DRAG_MIN_PRICE_SPAN,
  RIGHT_DRAG_MIN_SPAN_FACTOR,
  RIGHT_DRAG_MIN_TIME_SPAN_BARS,
  RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE,
  anchorFractionOfRange,
  clampRightDragSpanFactor,
  isValidRightDragRange,
  resolveRightDragSpanFactors,
  scaleLogicalRangeAroundAnchor,
  scalePriceRangeAroundAnchor,
  scaleRangeAroundAnchor,
} from './rightDragChartScaling.ts'

const LOGICAL_RANGE = { from: 100, to: 300 }
const PRICE_RANGE = { from: 29000, to: 31000 }

function assertAnchored(
  computed: { from: number; to: number },
  initial: { from: number; to: number },
  anchor: number,
) {
  const before = anchorFractionOfRange(initial, anchor)
  const after = anchorFractionOfRange(computed, anchor)
  assert.ok(before !== null && after !== null)
  assert.ok(Math.abs(before - after) < 1e-9, `anchor moved: ${before} -> ${after}`)
}

describe('resolveRightDragSpanFactors', () => {
  it('maps drag right to a smaller time span and drag left to a larger one', () => {
    const right = resolveRightDragSpanFactors(RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE, 0)
    const left = resolveRightDragSpanFactors(-RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE, 0)
    assert.equal(right.time, 0.5)
    assert.equal(left.time, 2)
    assert.equal(right.price, 1)
    assert.equal(left.price, 1)
  })

  it('maps drag up to a smaller price span and drag down to a larger one', () => {
    const up = resolveRightDragSpanFactors(0, -RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE)
    const down = resolveRightDragSpanFactors(0, RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE)
    assert.equal(up.price, 0.5)
    assert.equal(down.price, 2)
    assert.equal(up.time, 1)
    assert.equal(down.time, 1)
  })

  it('keeps both axes independent for pure horizontal and pure vertical deltas', () => {
    assert.equal(resolveRightDragSpanFactors(37, 0).price, 1)
    assert.equal(resolveRightDragSpanFactors(0, -37).time, 1)
  })

  it('composes both axes continuously for a diagonal delta', () => {
    const diagonal = resolveRightDragSpanFactors(80, -80)
    assert.ok(diagonal.time < 1)
    assert.ok(diagonal.price < 1)
    // Same magnitude, mirrored sign: the two factors are equal by construction.
    assert.ok(Math.abs(diagonal.time - diagonal.price) < 1e-12)
  })

  it('clamps extreme deltas into the documented factor bounds', () => {
    const huge = resolveRightDragSpanFactors(1e9, -1e9)
    assert.equal(huge.time, RIGHT_DRAG_MIN_SPAN_FACTOR)
    assert.equal(huge.price, RIGHT_DRAG_MIN_SPAN_FACTOR)
    const negative = resolveRightDragSpanFactors(-1e9, 1e9)
    assert.equal(negative.time, RIGHT_DRAG_MAX_SPAN_FACTOR)
    assert.equal(negative.price, RIGHT_DRAG_MAX_SPAN_FACTOR)
  })

  it('treats non-finite deltas as no movement', () => {
    assert.deepEqual(resolveRightDragSpanFactors(Number.NaN, Number.POSITIVE_INFINITY), {
      time: 1,
      price: 1,
    })
  })

  it('maps underflow/overflow and invalid factors to the documented bounds', () => {
    assert.equal(clampRightDragSpanFactor(0), RIGHT_DRAG_MIN_SPAN_FACTOR)
    assert.equal(
      clampRightDragSpanFactor(Number.POSITIVE_INFINITY),
      RIGHT_DRAG_MAX_SPAN_FACTOR,
    )
    assert.equal(clampRightDragSpanFactor(-2), 1)
    assert.equal(clampRightDragSpanFactor(Number.NaN), 1)
  })
})

describe('scaleLogicalRangeAroundAnchor', () => {
  it('shrinks the time span for drag right and keeps the anchor fixed', () => {
    const anchor = 175
    const next = scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, anchor, 0.5)
    assert.ok(next)
    assert.equal(next.to - next.from, 100)
    assertAnchored(next, LOGICAL_RANGE, anchor)
  })

  it('grows the time span for drag left and keeps the anchor fixed', () => {
    const anchor = 260
    const next = scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, anchor, 2)
    assert.ok(next)
    assert.equal(next.to - next.from, 400)
    assertAnchored(next, LOGICAL_RANGE, anchor)
  })

  it('preserves an anchor that is not at the center of the range', () => {
    const anchor = 130
    const next = scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, anchor, 1.5)
    assert.ok(next)
    assertAnchored(next, LOGICAL_RANGE, anchor)
  })

  it('enforces the minimum logical span while keeping the anchor', () => {
    const anchor = 199
    const next = scaleLogicalRangeAroundAnchor(
      { from: 198, to: 200.5 },
      anchor,
      1 / 64,
    )
    assert.ok(next)
    assert.equal(next.to - next.from, RIGHT_DRAG_MIN_TIME_SPAN_BARS)
    assertAnchored(next, { from: 198, to: 200.5 }, anchor)
  })

  it('returns finite upward ranges for huge deltas', () => {
    const anchor = 150
    for (const factor of [RIGHT_DRAG_MIN_SPAN_FACTOR, RIGHT_DRAG_MAX_SPAN_FACTOR]) {
      const next = scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, anchor, factor)
      assert.ok(next)
      assert.ok(Number.isFinite(next.from) && Number.isFinite(next.to))
      assert.ok(next.from < next.to)
      assertAnchored(next, LOGICAL_RANGE, anchor)
    }
  })

  it('rejects inverted, empty, NaN and infinite inputs', () => {
    assert.equal(scaleLogicalRangeAroundAnchor({ from: 300, to: 100 }, 150, 1), null)
    assert.equal(scaleLogicalRangeAroundAnchor({ from: 100, to: 100 }, 150, 1), null)
    assert.equal(
      scaleLogicalRangeAroundAnchor({ from: Number.NaN, to: 100 }, 150, 1),
      null,
    )
    assert.equal(
      scaleLogicalRangeAroundAnchor({ from: 100, to: Number.POSITIVE_INFINITY }, 150, 1),
      null,
    )
    assert.equal(scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, Number.NaN, 1), null)
    assert.equal(scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, 150, 0), null)
    assert.equal(scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, 150, -1), null)
  })
})

describe('scalePriceRangeAroundAnchor', () => {
  it('shrinks the candle-price span for drag up and keeps the anchor fixed', () => {
    const anchor = 30500
    const next = scalePriceRangeAroundAnchor(PRICE_RANGE, anchor, 0.5)
    assert.ok(next)
    assert.equal(next.to - next.from, 1000)
    assertAnchored(next, PRICE_RANGE, anchor)
  })

  it('grows the candle-price span for drag down and keeps the anchor fixed', () => {
    const anchor = 29200
    const next = scalePriceRangeAroundAnchor(PRICE_RANGE, anchor, 2)
    assert.ok(next)
    assert.equal(next.to - next.from, 4000)
    assertAnchored(next, PRICE_RANGE, anchor)
  })

  it('composes independently from the logical range', () => {
    const logical = scaleLogicalRangeAroundAnchor(LOGICAL_RANGE, 150, 0.75)
    const price = scalePriceRangeAroundAnchor(PRICE_RANGE, 30000, 1.25)
    assert.ok(logical && price)
    assert.equal(logical.to - logical.from, 150)
    assert.equal(price.to - price.from, 2500)
  })

  it('enforces the minimum price span on degenerate ranges', () => {
    const tiny = { from: 0, to: 1e-7 }
    const next = scalePriceRangeAroundAnchor(tiny, 5e-8, 1 / 64)
    assert.ok(next)
    assert.ok(Math.abs(next.to - next.from - RIGHT_DRAG_MIN_PRICE_SPAN) < 1e-20)
    assertAnchored(next, tiny, 5e-8)
  })

  it('never returns an inverted, zero, NaN or infinite price range', () => {
    for (const delta of [0, 1, 12, 400, -400, 1e6, -1e6]) {
      const factor = resolveRightDragSpanFactors(0, delta).price
      const next = scalePriceRangeAroundAnchor(PRICE_RANGE, 30000, factor)
      assert.ok(next)
      assert.ok(Number.isFinite(next.from) && Number.isFinite(next.to))
      assert.ok(next.from < next.to)
    }
  })
})

describe('isValidRightDragRange', () => {
  it('accepts only finite, ascending ranges', () => {
    assert.equal(isValidRightDragRange({ from: 0, to: 1 }), true)
    assert.equal(isValidRightDragRange({ from: 1, to: 0 }), false)
    assert.equal(isValidRightDragRange({ from: 1, to: 1 }), false)
    assert.equal(isValidRightDragRange({ from: Number.NaN, to: 1 }), false)
    assert.equal(isValidRightDragRange(null), false)
  })
})

describe('scaleRangeAroundAnchor', () => {
  it('returns the same anchor fraction for a neutral factor', () => {
    const next = scaleRangeAroundAnchor(PRICE_RANGE, 30000, 1)
    assert.ok(next)
    assert.ok(Math.abs(next.from - PRICE_RANGE.from) < 1e-9)
    assert.ok(Math.abs(next.to - PRICE_RANGE.to) < 1e-9)
  })
})
