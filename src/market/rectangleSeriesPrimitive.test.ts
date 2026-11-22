import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RectangleSeriesPrimitive, attachRectangleSeriesPrimitive } from './rectangleSeriesPrimitive.ts'
import { createRectangleInstance } from './rectangleInstances.ts'

describe('rectangleSeriesPrimitive lifecycle', () => {
  it('attaches once and updates views without re-attaching', () => {
    let attachCount = 0
    let seriesDataReads = 0
    const series = {
      attachPrimitive: () => {
        attachCount += 1
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 100 - price,
      data: () => {
        seriesDataReads += 1
        return [{ time: 10 }, { time: 20 }]
      },
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
      lastBarUnixTime: 20,
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
    assert.equal(seriesDataReads, 0)
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
      lastBarUnixTime: null,
    }))
    attachment.dispose()
    assert.equal(detached, true)
  })
})


function rectangleSchedulingChart() {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time,
      timeToIndex: (time: number) => (time === 10 ? 0 : time === 20 ? 1 : null),
      logicalToCoordinate: (logical: number) => logical * 10,
      coordinateToLogical: (x: number) => x / 10,
      coordinateToTime: (x: number) => (x === 10 ? 10 : x === 20 ? 20 : null),
      options: () => ({ barSpacing: 6 }),
    }),
    panes: () => [{ getHeight: () => 400 }],
  } as never
}

function rectangleSchedulingSeries() {
  return { priceToCoordinate: (price: number) => 500 - price } as never
}

function rectangleSchedulingInstance() {
  const instance = createRectangleInstance({
    fromTime: 10,
    toTime: 20,
    lowPrice: 100,
    highPrice: 120,
  })
  if (!instance) throw new Error('rectangle instance fixture is invalid')
  return instance
}

function rectangleSchedulingContext(
  instances: NonNullable<ReturnType<typeof createRectangleInstance>>[],
) {
  return {
    instances,
    interaction: { phase: 'inactive' as const, selectedId: null, draft: null },
    pointerTime: null,
    pointerPrice: null,
    intervalDurationSeconds: 60,
    lastBarUnixTime: 20,
  }
}

describe('rectangleSeriesPrimitive scheduling', () => {
  it('library updateAllViews does not request another redraw', () => {
    let requests = 0
    const primitive = new RectangleSeriesPrimitive(() =>
      rectangleSchedulingContext([rectangleSchedulingInstance()]),
    )
    primitive.attached({
      chart: rectangleSchedulingChart(),
      series: rectangleSchedulingSeries(),
      requestUpdate: () => {
        requests += 1
      },
    })
    assert.equal(requests, 1)
    requests = 0

    primitive.updateAllViews()
    primitive.updateAllViews()

    assert.equal(requests, 0)
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.notEqual(view.renderer(), null)
    primitive.detached()
  })

  it('explicit invalidate and public attachment update still request a paint', () => {
    let requests = 0
    let captured: RectangleSeriesPrimitive | null = null
    const series = {
      attachPrimitive: (primitive: RectangleSeriesPrimitive) => {
        captured = primitive
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 500 - price,
    }
    const attachment = attachRectangleSeriesPrimitive(
      series as never,
      () => rectangleSchedulingContext([rectangleSchedulingInstance()]),
    )
    assert.notEqual(captured, null)
    captured!.attached({
      chart: rectangleSchedulingChart(),
      series: series as never,
      requestUpdate: () => {
        requests += 1
      },
    })
    requests = 0

    captured!.invalidate()
    assert.equal(requests, 1)

    requests = 0
    attachment.update()
    assert.equal(requests, 1)

    attachment.dispose()
    attachment.update()
    assert.equal(requests, 1)
  })

  it('empty and hidden states settle without requests or renderer work', () => {
    let requests = 0
    let context = rectangleSchedulingContext([])
    const primitive = new RectangleSeriesPrimitive(() => context)
    primitive.attached({
      chart: rectangleSchedulingChart(),
      series: rectangleSchedulingSeries(),
      requestUpdate: () => {
        requests += 1
      },
    })
    requests = 0
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(requests, 0)
    assert.equal(view.renderer(), null)

    context = rectangleSchedulingContext([
      { ...rectangleSchedulingInstance(), hidden: true },
    ])
    primitive.updateAllViews()
    assert.equal(requests, 0)
    assert.equal(view.renderer(), null)
  })

  it('a view-only callback reflects an externally updated context on the next library update', () => {
    let context = rectangleSchedulingContext([])
    const primitive = new RectangleSeriesPrimitive(() => context)
    primitive.attached({
      chart: rectangleSchedulingChart(),
      series: rectangleSchedulingSeries(),
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)

    context = rectangleSchedulingContext([rectangleSchedulingInstance()])
    primitive.updateAllViews()
    assert.notEqual(view.renderer(), null)
    primitive.detached()
  })
})
