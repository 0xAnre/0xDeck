import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
})
