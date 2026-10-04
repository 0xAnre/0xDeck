import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RectangleSeriesPrimitive, attachRectangleSeriesPrimitive } from './rectangleSeriesPrimitive.ts'
import { createRectangleInstance } from './rectangleInstances.ts'

describe('rectangleSeriesPrimitive lifecycle', () => {
  it('attaches once and updates views without re-attaching', () => {
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
      panes: () => [{ getHeight: () => 400 }],
    }

    const instance = createRectangleInstance({
      fromTime: 10,
      toTime: 20,
      lowPrice: 1,
      highPrice: 2,
    })!

    const primitive = new RectangleSeriesPrimitive(() => ({
      instances: [instance],
      interaction: { phase: 'inactive', selectedId: instance.id, draft: null },
      pointerTime: null,
      pointerPrice: null,
    }))
    series.attachPrimitive(primitive)
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.notEqual(view.renderer(), null)
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
    const attachment = attachRectangleSeriesPrimitive(series as never, () => ({
      instances: [],
      interaction: { phase: 'inactive', selectedId: null, draft: null },
      pointerTime: null,
      pointerPrice: null,
    }))
    attachment.dispose()
    assert.equal(detached, true)
  })
})
