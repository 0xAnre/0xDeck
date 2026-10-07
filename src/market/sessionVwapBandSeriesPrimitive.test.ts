import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Logical } from 'lightweight-charts'
import {
  SessionVwapBandSeriesPrimitive,
  attachSessionVwapBandSeriesPrimitive,
} from './sessionVwapBandSeriesPrimitive.ts'

describe('sessionVwapBandSeriesPrimitive lifecycle', () => {
  it('attaches once and clears models when hidden', () => {
    let attachCount = 0
    const series = {
      attachPrimitive: () => {
        attachCount += 1
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 100 - price,
    }
    const chart = {
      timeScale: () => ({
        timeToCoordinate: (time: number) => time,
        options: () => ({ barSpacing: 6 }),
      }),
    }

    const primitive = new SessionVwapBandSeriesPrimitive(() => ({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: false,
    }))
    series.attachPrimitive(primitive)
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)
    assert.equal(attachCount, 1)
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
    const attachment = attachSessionVwapBandSeriesPrimitive(series as never, {
      points: [],
      visible: true,
    })
    attachment.dispose()
    assert.equal(detached, true)
  })

  it('includes visible band bounds in autoscale and ignores hidden bands', () => {
    const points = [
      { time: 10, upper1: 12, lower1: 8 },
      { time: 20, upper1: 30, lower1: 4 },
      { time: 30, upper1: 100, lower1: 1 },
    ]
    let visible = true
    const primitive = new SessionVwapBandSeriesPrimitive(() => ({
      points,
      visible,
    }))
    primitive.attached({
      chart: {
        timeScale: () => ({
          timeToCoordinate: (time: number) => time,
          options: () => ({ barSpacing: 6 }),
        }),
      } as never,
      series: {
        barsInLogicalRange: () => ({ from: 10 as never, to: 20 as never }),
        priceToCoordinate: (price: number) => 100 - price,
      } as never,
      requestUpdate: () => {},
    })

    assert.deepEqual(primitive.autoscaleInfo(0 as Logical, 1 as Logical), {
      priceRange: { minValue: 4, maxValue: 30 },
    })

    visible = false
    assert.equal(primitive.autoscaleInfo(0 as Logical, 1 as Logical), null)
  })
})
