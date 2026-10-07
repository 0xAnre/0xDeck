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
      data: () => [{ time: 10 }, { time: 20 }],
    }
    const chart = {
      timeScale: () => ({
        timeToCoordinate: (time: number) => time,
        timeToIndex: (time: number) => (time === 10 ? 0 : time === 20 ? 1 : null),
        logicalToCoordinate: (logical: number) => logical * 10,
        coordinateToLogical: (x: number) => x / 10,
        coordinateToTime: (x: number) => (x === 10 ? 10 : x === 20 ? 20 : null),
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
      intervalDurationSeconds: 60,
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
      intervalDurationSeconds: 60,
    }))
    attachment.dispose()
    assert.equal(detached, true)
  })
})
