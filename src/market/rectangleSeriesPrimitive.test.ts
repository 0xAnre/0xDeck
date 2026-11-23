import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { RectangleSeriesPrimitive, attachRectangleSeriesPrimitive } from './rectangleSeriesPrimitive.ts'
import { createRectangleInstance, type RectangleInstance } from './rectangleInstances.ts'

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


/**
 * Two loaded bars (open times 10 and 20, interval 10 s) whose first bar starts
 * at pane x=300, like a panned chart with loaded history in the middle of the
 * pane. Every timestamp before 10 is before the loaded history.
 */
function clippedHistoryChart() {
  const barTimes = [10, 20]
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => {
        const index = barTimes.indexOf(time)
        return index === -1 ? null : 300 + index * 100
      },
      timeToIndex: (time: number, findNearest?: boolean) => {
        const index = barTimes.findIndex((bar) => bar >= time)
        if (index !== -1) return barTimes[index] > time ? (findNearest ? index : null) : index
        return findNearest ? barTimes.length - 1 : null
      },
      logicalToCoordinate: (logical: number) => 300 + logical * 100,
      coordinateToLogical: (x: number) => (x - 300) / 100,
      coordinateToTime: (x: number) => barTimes[Math.round((x - 300) / 100)] ?? null,
      options: () => ({ barSpacing: 100 }),
    }),
    panes: () => [{ getHeight: () => 500 }],
  } as never
}

function clippedHistorySeries() {
  return { priceToCoordinate: (price: number) => 500 - price } as never
}

function clippedHistoryPrimitive(instances: readonly (RectangleInstance | null)[]) {
  const present = instances.filter((instance): instance is RectangleInstance => instance !== null)
  return new RectangleSeriesPrimitive(() => ({
    instances: present,
    interaction: { phase: 'inactive', selectedId: present[0]?.id ?? null, draft: null },
    pointerTime: null,
    pointerPrice: null,
    intervalDurationSeconds: 10,
    lastBarUnixTime: 20,
  }))
}

function mountPrimitive(primitive: RectangleSeriesPrimitive) {
  primitive.attached({
    chart: clippedHistoryChart(),
    series: clippedHistorySeries(),
    requestUpdate: () => {},
  })
  primitive.updateAllViews()
  return primitive.paneViews()[0] as { renderer: () => { draw: (target: unknown) => void } | null }
}

type RecordedPaint = {
  fills: { left: number; top: number; width: number; height: number; fillStyle: string }[]
  arcs: { x: number; y: number; radius: number; fillStyle: string }[]
}

function recordingTarget(pixelRatio = 1): { target: CanvasRenderingTarget2D; recorded: RecordedPaint } {
  const recorded: RecordedPaint = { fills: [], arcs: [] }
  const target = {
    useBitmapCoordinateSpace: (callback: (scope: unknown) => void) => {
      const context = {
        fillStyle: '',
        globalAlpha: 1,
        save() {},
        restore() {},
        beginPath() {},
        rect() {},
        clip() {},
        fill() {},
        fillRect(left: number, top: number, width: number, height: number) {
          recorded.fills.push({ left, top, width, height, fillStyle: context.fillStyle })
        },
        arc(x: number, y: number, radius: number) {
          recorded.arcs.push({ x, y, radius, fillStyle: context.fillStyle })
        },
      }
      callback({
        context,
        horizontalPixelRatio: pixelRatio,
        verticalPixelRatio: pixelRatio,
        bitmapSize: { width: 1000, height: 500 },
        mediaSize: { width: 1000 / pixelRatio, height: 500 / pixelRatio },
      })
    },
  } as unknown as CanvasRenderingTarget2D
  return { target, recorded }
}

function paintedModels(pixelRatio = 1) {
  const instance = {
    ...createRectangleInstance({
      fromTime: 5,
      toTime: 20,
      lowPrice: 100,
      highPrice: 200,
    })!,
    fillColor: '#ff0000',
    fillOpacity: 100,
  }
  const primitive = clippedHistoryPrimitive([instance])
  const view = mountPrimitive(primitive)
  const renderer = view.renderer()
  assert.notEqual(renderer, null)
  const { target, recorded } = recordingTarget(pixelRatio)
  renderer!.draw(target)
  primitive.detached()
  return recorded
}

describe('rectangleSeriesPrimitive visible part before loaded history', () => {
  it('paints the loaded part of a box whose start predates the loaded history', () => {
    for (const pixelRatio of [1, 2]) {
      const recorded = paintedModels(pixelRatio)
      assert.equal(recorded.fills.length, 1)
      assert.deepEqual(recorded.fills[0], {
        left: Math.round(300 * pixelRatio),
        top: Math.round(300 * pixelRatio),
        width: Math.round(400 * pixelRatio) - Math.round(300 * pixelRatio),
        height: Math.round(400 * pixelRatio) - Math.round(300 * pixelRatio),
        fillStyle: '#ff0000',
      })
      // No handle at the clipped start (x = first loaded bar); only the loaded
      // east/top/bottom handles are painted.
      assert.equal(recorded.arcs.length, 5)
      assert.ok(recorded.arcs.every((arc) => arc.x !== Math.round(300 * pixelRatio)))
      assert.ok(recorded.arcs.every((arc) => arc.radius === 4 * pixelRatio))
    }
  })

  it('paints the same pixels as the same box anchored on the loaded edge', () => {
    const clipped = paintedModels(2)
    const anchoredInstance = {
      ...createRectangleInstance({
        fromTime: 10,
        toTime: 20,
        lowPrice: 100,
        highPrice: 200,
      })!,
      fillColor: '#ff0000',
      fillOpacity: 100,
    }
    const primitive = clippedHistoryPrimitive([anchoredInstance])
    const view = mountPrimitive(primitive)
    const renderer = view.renderer()
    assert.notEqual(renderer, null)
    const { target, recorded: anchored } = recordingTarget(2)
    renderer!.draw(target)
    primitive.detached()

    assert.deepEqual(clipped.fills, anchored.fills)
    assert.equal(clipped.arcs.length + 3, anchored.arcs.length)
  })

  it('draws nothing for a box entirely before the loaded history', () => {
    const beforeHistory = createRectangleInstance({
      fromTime: 1,
      toTime: 5,
      lowPrice: 100,
      highPrice: 200,
    })!
    const primitive = clippedHistoryPrimitive([beforeHistory])
    const view = mountPrimitive(primitive)
    assert.equal(view.renderer(), null)
    primitive.detached()
  })

  it('keeps a box covering the pane (start before, end in the future) painted', () => {
    const covering = {
      ...createRectangleInstance({
        fromTime: 5,
        toTime: 60,
        lowPrice: 100,
        highPrice: 200,
      })!,
      fillColor: '#00ff00',
      fillOpacity: 100,
    }
    const primitive = clippedHistoryPrimitive([covering])
    const view = mountPrimitive(primitive)
    const renderer = view.renderer()
    assert.notEqual(renderer, null)
    const { target, recorded } = recordingTarget(1)
    renderer!.draw(target)
    primitive.detached()
    assert.equal(recorded.fills.length, 1)
    assert.equal(recorded.fills[0].left, 300)
    assert.equal(recorded.fills[0].left + recorded.fills[0].width, 300 + 5 * 100)
    assert.equal(recorded.fills[0].fillStyle, '#00ff00')
  })
})
