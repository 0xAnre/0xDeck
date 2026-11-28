import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  barSegments,
  barWidth,
  computeLayout,
  isInBarArea,
  placeTooltip,
  scaleDomain,
} from './geometry.ts'

const layout = computeLayout(1200, 600)

describe('computeLayout — one bar origin, one leftward scale', () => {
  it('anchors every bar left of the centred price gutter', () => {
    assert.equal(layout.spine, 600)
    assert.equal(layout.anchor, 600 - layout.gutter / 2)
    assert.ok(layout.anchor < layout.spine)
    assert.equal(layout.maxBarWidth, layout.anchor - 14)
  })

  it('keeps the bar area growing when the viewport shrinks (responsive)', () => {
    const narrow = computeLayout(390, 700)
    const wide = computeLayout(1600, 700)
    assert.ok(narrow.maxBarWidth > 16)
    assert.ok(wide.maxBarWidth > narrow.maxBarWidth)
    // The bar origin always stays at the gutter, never off-canvas.
    for (const candidate of [narrow, wide]) {
      assert.ok(candidate.anchor > 0)
      assert.ok(candidate.anchor - candidate.maxBarWidth >= 0)
    }
  })
})

describe('barWidth / scaleDomain — one scale for both colours', () => {
  it('uses the larger single-side row as the shared domain', () => {
    assert.equal(scaleDomain(860, 1033), 1033)
    assert.equal(scaleDomain(900, 0), 900)
    assert.equal(scaleDomain(0, 0), 0)
    assert.equal(scaleDomain(Number.NaN, 5), 5)
  })

  it('draws equal long and short sizes at equal width', () => {
    const domain = 1000
    assert.equal(
      barWidth(250, domain, layout.maxBarWidth),
      barWidth(250, domain, layout.maxBarWidth),
    )
    assert.equal(barWidth(1000, domain, layout.maxBarWidth), layout.maxBarWidth)
    assert.equal(
      barWidth(500, domain, layout.maxBarWidth),
      layout.maxBarWidth / 2,
    )
  })

  it('clamps empty and invalid values to no bar', () => {
    assert.equal(barWidth(0, 1000, 500), 0)
    assert.equal(barWidth(-5, 1000, 500), 0)
    assert.equal(barWidth(5, 0, 500), 0)
    assert.equal(barWidth(Number.NaN, 1000, 500), 0)
  })
})

describe('barSegments — both sides grow left from the same anchor', () => {
  it('extends a long (green) bar to the left of the anchor', () => {
    const [segment] = barSegments({ long: 500, short: 0 }, 1000, layout)
    assert.equal(segment.side, 'long')
    assert.ok(segment.width > 0)
    // Right edge is the anchor; the bar extends leftwards from it.
    assert.equal(segment.x + segment.width, layout.anchor)
    assert.ok(segment.x < layout.anchor)
    // Never to the right of the anchor (the direction the user asked to change).
    assert.ok(segment.x + segment.width <= layout.anchor)
  })

  it('keeps the short (red) direction unchanged and also leftward', () => {
    const [segment] = barSegments({ long: 0, short: 500 }, 1000, layout)
    assert.equal(segment.side, 'short')
    assert.equal(segment.x + segment.width, layout.anchor)
    assert.ok(segment.x >= layout.anchor - layout.maxBarWidth)
  })

  it('paints both sides from the shared scale when a row holds both', () => {
    const segments = barSegments({ long: 400, short: 800 }, 1000, layout)
    assert.equal(segments.length, 2)
    // Longest first, so the shorter side paints on top and both ends stay visible.
    assert.deepEqual(
      segments.map((segment) => segment.side),
      ['short', 'long'],
    )
    for (const segment of segments) {
      assert.equal(segment.x + segment.width, layout.anchor)
    }
    const short = segments.find((segment) => segment.side === 'short')
    const long = segments.find((segment) => segment.side === 'long')
    assert.ok(short && long)
    assert.equal(short.width / long.width, 2)
  })

  it('produces no segments for an empty row', () => {
    assert.deepEqual(barSegments({ long: 0, short: 0 }, 1000, layout), [])
  })
})

describe('isInBarArea — hover only where bars exist', () => {
  it('accepts the bar region and the price gutter', () => {
    assert.equal(isInBarArea(layout, layout.anchor), true)
    assert.equal(isInBarArea(layout, layout.anchor - 40), true)
    assert.equal(isInBarArea(layout, layout.spine), true)
    assert.equal(isInBarArea(layout, layout.spine + layout.gutter / 2), true)
  })

  it('rejects the empty area right of the gutter', () => {
    assert.equal(isInBarArea(layout, layout.spine + layout.gutter / 2 + 1), false)
    assert.equal(isInBarArea(layout, layout.width - 4), false)
  })

  it('rejects the far left outside the longest bar', () => {
    assert.equal(isInBarArea(layout, layout.anchor - layout.maxBarWidth - 40), false)
  })
})

describe('placeTooltip — never covers the bars it describes', () => {
  const base = {
    cursorX: 200,
    cursorY: 300,
    tooltipWidth: 260,
    tooltipHeight: 180,
    plotWidth: 1200,
    plotHeight: 600,
    layout,
  }

  it('places the tooltip right of the price gutter', () => {
    const placed = placeTooltip(base)
    assert.ok(placed.left >= layout.spine + layout.gutter / 2)
    assert.ok(placed.left + base.tooltipWidth <= base.plotWidth - 8)
  })

  it('keeps the tooltip inside the plot vertically', () => {
    const top = placeTooltip({ ...base, cursorY: 5 })
    assert.ok(top.top >= 8)
    const bottom = placeTooltip({ ...base, cursorY: 595 })
    assert.ok(bottom.top + base.tooltipHeight <= base.plotHeight - 8)
  })

  it('falls back to the rightmost fitting position on a narrow plot', () => {
    const narrow = computeLayout(390, 700)
    const placed = placeTooltip({ ...base, plotWidth: 390, plotHeight: 700, layout: narrow })
    assert.equal(placed.left, Math.max(8, 390 - base.tooltipWidth - 8))
    assert.ok(placed.left + base.tooltipWidth <= 390 - 8)
  })
})
