import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Logical } from 'lightweight-charts'
import {
  AnchoredVwapBandFillSeriesPrimitive,
  attachAnchoredVwapBandFillSeriesPrimitive,
  type AnchoredVwapBandFillSeriesPrimitiveContext,
} from './anchoredVwapBandFillSeriesPrimitive.ts'

function baseChart() {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time,
      options: () => ({ barSpacing: 6 }),
    }),
  }
}

describe('anchoredVwapBandFillSeriesPrimitive lifecycle', () => {
  it('attaches once and clears models when no fill is visible', () => {
    let attachCount = 0
    const series = {
      attachPrimitive: () => {
        attachCount += 1
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 100 - price,
    }

    let context: AnchoredVwapBandFillSeriesPrimitiveContext = {
      pairs: [
        {
          id: 'band1',
          points: [{ time: 10, upper: 12, lower: 8 }],
          visible: false,
          fillStyle: 'rgba(0, 0, 0, 0.2)',
        },
      ],
    }
    const primitive = new AnchoredVwapBandFillSeriesPrimitive(() => context)
    series.attachPrimitive(primitive)
    primitive.attached({
      chart: baseChart() as never,
      series: series as never,
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)
    assert.equal(attachCount, 1)

    context = {
      pairs: [{ ...context.pairs[0], visible: true }],
    }
    primitive.updateAllViews()
    assert.notEqual(view.renderer(), null)
    primitive.detached()
  })

  it('attach helper detaches on dispose', () => {
    let detached = false
    const series = {
      attachPrimitive: () => {},
      detachPrimitive: () => {
        detached = true
      },
      priceToCoordinate: () => 50,
    }
    const attachment = attachAnchoredVwapBandFillSeriesPrimitive(series as never, {
      pairs: [],
    })
    attachment.dispose()
    assert.equal(detached, true)
  })

  it('includes visible fill bounds in autoscale and ignores hidden fills', () => {
    const pairs = [
      {
        id: 'band1',
        points: [
          { time: 10, upper: 12, lower: 8 },
          { time: 20, upper: 30, lower: 4 },
          { time: 30, upper: 100, lower: 1 },
        ],
        visible: true,
        fillStyle: 'rgba(0, 0, 0, 0.2)',
      },
      {
        id: 'band2',
        points: [{ time: 10, upper: 5000, lower: 4000 }],
        visible: false,
        fillStyle: 'rgba(0, 0, 0, 0.2)',
      },
    ]
    const primitive = new AnchoredVwapBandFillSeriesPrimitive(() => ({ pairs }))
    primitive.attached({
      chart: baseChart() as never,
      series: {
        barsInLogicalRange: () => ({ from: 10 as never, to: 20 as never }),
        priceToCoordinate: (price: number) => 100 - price,
      } as never,
      requestUpdate: () => {},
    })

    assert.deepEqual(primitive.autoscaleInfo(0 as Logical, 1 as Logical), {
      priceRange: { minValue: 4, maxValue: 30 },
    })

    pairs[0].visible = false
    assert.equal(primitive.autoscaleInfo(0 as Logical, 1 as Logical), null)
  })

  it('returns null autoscale when the visible window cannot be resolved', () => {
    const primitive = new AnchoredVwapBandFillSeriesPrimitive(() => ({
      pairs: [
        {
          id: 'band1',
          points: [{ time: 10, upper: 12, lower: 8 }],
          visible: true,
          fillStyle: 'rgba(0, 0, 0, 0.2)',
        },
      ],
    }))
    primitive.attached({
      chart: baseChart() as never,
      series: {
        barsInLogicalRange: () => null,
        priceToCoordinate: () => 0,
      } as never,
      requestUpdate: () => {},
    })
    assert.equal(primitive.autoscaleInfo(0 as Logical, 1 as Logical), null)
  })
})
