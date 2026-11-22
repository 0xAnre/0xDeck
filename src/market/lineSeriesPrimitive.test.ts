import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LineSeriesPrimitive,
  attachLineSeriesPrimitive,
  type LineSeriesPrimitiveContext,
} from './lineSeriesPrimitive.ts'
import { createLineInstance, setLineInstanceHidden } from './lineInstances.ts'

function fakeChart() {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time / 10,
      timeToIndex: (time: number) => (time === 10 ? 0 : time === 20 ? 1 : null),
      logicalToCoordinate: (logical: number) => logical * 10,
      coordinateToLogical: (x: number) => x / 10,
      coordinateToTime: (x: number) => (x === 10 ? 10 : x === 20 ? 20 : null),
      options: () => ({ barSpacing: 6 }),
    }),
  } as never
}

function fakeSeries() {
  return { priceToCoordinate: (price: number) => 500 - price } as never
}

function contextFor(
  instances: LineSeriesPrimitiveContext['instances'],
  selectedId: string | null = null,
): LineSeriesPrimitiveContext {
  return {
    instances,
    interaction: { phase: 'inactive', selectedId, draft: null },
    pointerTime: null,
    pointerPrice: null,
    intervalDurationSeconds: 60,
    lastBarUnixTime: 20,
  }
}

function lineInstance() {
  const instance = createLineInstance({
    timeA: 10,
    priceA: 100,
    timeB: 20,
    priceB: 110,
  })
  if (!instance) throw new Error('line instance fixture is invalid')
  return instance
}

describe('lineSeriesPrimitive scheduling', () => {
  it('library updateAllViews updates the view without requesting another redraw', () => {
    let requests = 0
    const primitive = new LineSeriesPrimitive(() => contextFor([lineInstance()]))
    primitive.attached({
      chart: fakeChart(),
      series: fakeSeries(),
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

  it('explicit invalidate and the public attachment update still request a paint', () => {
    let requests = 0
    let captured: LineSeriesPrimitive | null = null
    const series = {
      attachPrimitive: (primitive: LineSeriesPrimitive) => {
        captured = primitive
      },
      detachPrimitive: () => {},
      priceToCoordinate: (price: number) => 500 - price,
    }
    const attachment = attachLineSeriesPrimitive(series as never, () => contextFor([lineInstance()]))
    assert.notEqual(captured, null)
    captured!.attached({
      chart: fakeChart(),
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
    let context = contextFor([])
    const primitive = new LineSeriesPrimitive(() => context)
    primitive.attached({
      chart: fakeChart(),
      series: fakeSeries(),
      requestUpdate: () => {
        requests += 1
      },
    })
    requests = 0
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(requests, 0)
    assert.equal(view.renderer(), null)

    context = contextFor([setLineInstanceHidden(lineInstance(), true)])
    primitive.updateAllViews()
    assert.equal(requests, 0)
    assert.equal(view.renderer(), null)
  })

  it('a view-only callback reflects an externally updated context on the next library update', () => {
    let context = contextFor([])
    const primitive = new LineSeriesPrimitive(() => context)
    primitive.attached({
      chart: fakeChart(),
      series: fakeSeries(),
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)

    const instance = lineInstance()
    context = contextFor([instance], instance.id)
    primitive.updateAllViews()
    assert.notEqual(view.renderer(), null)
    primitive.detached()
  })
})
