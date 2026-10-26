import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
  ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR,
  orderBookDepthLineColorForValue,
  toOrderBookDepthLineData,
  toOrderBookDepthLineDataPoint,
} from './orderBookDepthThresholdColors.ts'
import type { OrderBookDepthThresholds } from './orderBookDepth.ts'

const THRESHOLDS: OrderBookDepthThresholds = { positive: 25, negative: -25 }

describe('orderBookDepthLineColorForValue', () => {
  it('uses fixed green above the positive and red below the negative threshold', () => {
    assert.equal(ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR, '#22C55E')
    assert.equal(ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR, '#EF4444')
  })

  it('colors exact threshold equality', () => {
    assert.equal(
      orderBookDepthLineColorForValue(25, THRESHOLDS),
      ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR,
    )
    assert.equal(
      orderBookDepthLineColorForValue(-25, THRESHOLDS),
      ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
    )
  })

  it('keeps the user gray color strictly between the thresholds', () => {
    assert.equal(orderBookDepthLineColorForValue(24.999, THRESHOLDS), undefined)
    assert.equal(orderBookDepthLineColorForValue(0, THRESHOLDS), undefined)
    assert.equal(orderBookDepthLineColorForValue(-24.999, THRESHOLDS), undefined)
  })

  it('follows custom thresholds', () => {
    const custom = { positive: 60, negative: -60 }
    assert.equal(orderBookDepthLineColorForValue(25, custom), undefined)
    assert.equal(
      orderBookDepthLineColorForValue(60, custom),
      ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR,
    )
    assert.equal(
      orderBookDepthLineColorForValue(-60, custom),
      ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
    )
  })
})

describe('toOrderBookDepthLineData', () => {
  it('carries the threshold color on a point and omits it in the middle', () => {
    assert.deepEqual(
      toOrderBookDepthLineDataPoint(
        { time: 1_700_000_000, value: 30 },
        THRESHOLDS,
      ),
      {
        time: 1_700_000_000,
        value: 30,
        color: ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR,
      },
    )
    assert.deepEqual(
      toOrderBookDepthLineDataPoint(
        { time: 1_700_000_000, value: 5 },
        THRESHOLDS,
      ),
      { time: 1_700_000_000, value: 5 },
    )
  })

  it('colors every historical point', () => {
    assert.deepEqual(
      toOrderBookDepthLineData(
        [
          { time: 1, value: 40 },
          { time: 2, value: 0 },
          { time: 3, value: -40 },
        ],
        THRESHOLDS,
      ),
      [
        { time: 1, value: 40, color: ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR },
        { time: 2, value: 0 },
        { time: 3, value: -40, color: ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR },
      ],
    )
  })
})
