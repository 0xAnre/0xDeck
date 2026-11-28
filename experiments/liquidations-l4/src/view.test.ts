import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fitView,
  massQuantile,
  niceTicks,
  panView,
  priceMassProfile,
  priceToY,
  spanOf,
  yToPrice,
  zoomView,
  type PriceMass,
} from './view.ts'

const TOP = 20
const BOTTOM = 620
const VIEW = { min: 50_000, max: 100_000 }

describe('price <-> row mapping', () => {
  it('puts the high price at the top and round-trips exactly', () => {
    assert.equal(priceToY(VIEW, TOP, BOTTOM, VIEW.max), TOP)
    assert.equal(priceToY(VIEW, TOP, BOTTOM, VIEW.min), BOTTOM)
    for (const price of [50_000, 61_234.5, 75_000, 99_999]) {
      const y = priceToY(VIEW, TOP, BOTTOM, price)
      assert.ok(Math.abs(yToPrice(VIEW, TOP, BOTTOM, y) - price) < 1e-9)
    }
  })

  it('keeps prices outside the window outside the plot', () => {
    assert.ok(priceToY(VIEW, TOP, BOTTOM, 120_000) < TOP)
    assert.ok(priceToY(VIEW, TOP, BOTTOM, 40_000) > BOTTOM)
  })
})

describe('zoomView', () => {
  it('keeps the anchor price under the cursor', () => {
    const anchor = 62_500
    const factor = 0.5
    const zoomed = zoomView(VIEW, anchor, factor)
    assert.ok(spanOf(zoomed) < spanOf(VIEW))
    const anchorBefore = priceToY(VIEW, TOP, BOTTOM, anchor)
    const anchorAfter = priceToY(zoomed, TOP, BOTTOM, anchor)
    assert.ok(Math.abs(anchorBefore - anchorAfter) < 1e-6)
  })

  it('zooms out symmetrically around the anchor', () => {
    const zoomed = zoomView(VIEW, 75_000, 2)
    assert.ok(Math.abs(spanOf(zoomed) - 100_000) < 1e-6)
    assert.ok(zoomed.min < VIEW.min)
    assert.ok(zoomed.max > VIEW.max)
  })

  it('refuses a degenerate or non-positive factor', () => {
    assert.deepEqual(zoomView(VIEW, 75_000, 0), VIEW)
    assert.deepEqual(zoomView(VIEW, 75_000, Number.NaN), VIEW)
  })

  it('stops at the minimum span instead of collapsing', () => {
    let overzoomed = VIEW
    for (let i = 0; i < 200; i += 1) overzoomed = zoomView(overzoomed, 75_000, 0.5)
    assert.ok(spanOf(overzoomed) >= 1e-3)
    assert.ok(overzoomed.min > 0)
  })
})

describe('panView', () => {
  it('shifts the window by a price delta', () => {
    const panned = panView(VIEW, 1_000)
    assert.equal(panned.min, 51_000)
    assert.equal(panned.max, 101_000)
  })

  it('keeps the span when clamping the window floor', () => {
    const panned = panView({ min: 1, max: 2 }, -1e9)
    assert.ok(panned.min > 0)
    assert.ok(Math.abs(spanOf(panned) - 1) < 1e-6)
  })
})

describe('massQuantile / fitView', () => {
  const entries: PriceMass[] = [
    { price: 4.3, mass: 0.01 },
    { price: 40_000, mass: 100 },
    { price: 60_000, mass: 100 },
    { price: 80_000, mass: 100 },
    { price: 493_400_000_000, mass: 0.01 },
  ]

  it('weights the quantile by liquidity, not by level count', () => {
    assert.equal(massQuantile(entries, 0), 4.3)
    const median = massQuantile(entries, 0.5)
    assert.ok(median !== null && median >= 40_000 && median <= 80_000)
    assert.equal(massQuantile([], 0.5), null)
  })

  it('frames the dense liquidity and excludes far outliers', () => {
    const view = fitView(entries)
    assert.ok(view !== null)
    if (!view) throw new Error('unreachable')
    // The 4.9e11 outlier must not stretch the window; the 40k-80k block must fit.
    assert.ok(view.max < 1e6, `unexpected max ${view.max}`)
    assert.ok(view.min <= 40_000, `unexpected min ${view.min}`)
    assert.ok(view.max >= 80_000, `unexpected max ${view.max}`)
    assert.ok(view.min > 0)
  })

  it('widens a single-level window to a usable span', () => {
    const view = fitView([{ price: 85_000, mass: 1 }])
    assert.ok(view !== null)
    if (!view) throw new Error('unreachable')
    assert.ok(spanOf(view) >= 85_000 * 0.04)
  })

  it('returns null for an empty book', () => {
    assert.equal(fitView([]), null)
  })

  it('weights by count by default and by size on request', () => {
    const entries = [
      { price: 50_000, size: 0.1 },
      { price: 60_000, size: 500 },
    ]
    const counted = priceMassProfile(entries)
    const sized = priceMassProfile(entries, 'size')
    assert.deepEqual(
      counted.map((entry) => entry.mass),
      [1, 1],
    )
    assert.deepEqual(
      sized.map((entry) => entry.mass),
      [0.1, 500],
    )
  })

  it('sorts and drops unusable prices when building the profile', () => {
    const profile = priceMassProfile([
      { price: 80_000, size: -2 },
      { price: 60_000, size: 1 },
      { price: 0, size: 5 },
      { price: Number.NaN, size: 5 },
    ])
    assert.deepEqual(
      profile.map((entry) => entry.price),
      [60_000, 80_000],
    )
    assert.deepEqual(
      profile.map((entry) => entry.mass),
      [1, 1],
    )
  })
})

describe('niceTicks', () => {
  it('produces round 1/2/2.5/5 steps inside the window', () => {
    const ticks = niceTicks({ min: 50_000, max: 100_000 }, 6)
    assert.ok(ticks.length >= 4)
    for (const tick of ticks) {
      assert.ok(tick >= 50_000 && tick <= 100_000)
    }
    const step = ticks[1] - ticks[0]
    const magnitude = 10 ** Math.floor(Math.log10(step))
    assert.ok([1, 2, 2.5, 5, 10].includes(step / magnitude))
  })

  it('is stable for a degenerate window', () => {
    assert.deepEqual(niceTicks({ min: 5, max: 5 }), [])
  })
})
