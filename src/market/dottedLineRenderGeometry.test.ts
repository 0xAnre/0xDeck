import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDottedLineSegmentGeometries } from './dottedLineRenderGeometry.ts'

describe('dottedLineRenderGeometry', () => {
  it('maps time/price anchors to pixel segments', () => {
    const segments = buildDottedLineSegmentGeometries({
      instances: [
        {
          id: 'dotted-line-a',
          fromTime: 100,
          fromPrice: 50_000,
          toTime: 200,
          toPrice: 51_000,
        },
      ],
      draft: null,
      timeToCoordinate: (time) => (time === 100 ? 10 : time === 200 ? 30 : null),
      priceToCoordinate: (price) => (price === 50_000 ? 100 : price === 51_000 ? 80 : null),
      strokeStyle: 'rgb(1, 2, 3)',
    })
    assert.equal(segments.length, 1)
    assert.equal(segments[0].x1, 10)
    assert.equal(segments[0].y1, 100)
    assert.equal(segments[0].x2, 30)
    assert.equal(segments[0].y2, 80)
  })

  it('includes draft preview segment', () => {
    const segments = buildDottedLineSegmentGeometries({
      instances: [],
      draft: {
        anchor: { time: 100, price: 50_000 },
        preview: { time: 150, price: 50_500 },
      },
      timeToCoordinate: (time) => time,
      priceToCoordinate: (price) => price / 1000,
      strokeStyle: 'rgb(0, 0, 0)',
    })
    assert.equal(segments.length, 1)
  })
})
