import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Logical } from 'lightweight-charts'
import {
  SessionVwapBandSeriesPrimitive,
  attachSessionVwapBandSeriesPrimitive,
  type SessionVwapBandSeriesPrimitiveContext,
} from './sessionVwapBandSeriesPrimitive.ts'
import type { SessionVwapBandVisibleWindow } from './sessionVwapBandRenderGeometry.ts'

type CapturedRender = {
  draw: (target: unknown) => void
}

type CapturedView = {
  update: () => void
  renderer: () => CapturedRender | null
}

type CapturedPrimitive = {
  attached: (param: unknown) => void
  updateAllViews: () => void
  paneViews: () => readonly CapturedView[]
}

function linearPoints(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    time: index,
    upper1: 11 + (index % 5),
    lower1: 9 - (index % 3),
  }))
}

function createPrimitiveHarness(
  context: SessionVwapBandSeriesPrimitiveContext,
  initialVisibleWindow: SessionVwapBandVisibleWindow = { fromTime: 10, toTime: 10 },
) {
  let primitive: CapturedPrimitive | null = null
  let requests = 0
  let timeConversions = 0
  let priceConversions = 0
  let visibleWindow = initialVisibleWindow

  const timeScale = {
    timeToCoordinate: (time: number) => {
      timeConversions += 1
      return time
    },
    getVisibleRange: () => ({
      from: visibleWindow.fromTime,
      to: visibleWindow.toTime,
    }),
    options: () => ({ barSpacing: 6 }),
  }
  const series = {
    attachPrimitive: (attached: CapturedPrimitive) => {
      primitive = attached
    },
    detachPrimitive: () => {},
    priceToCoordinate: (price: number) => {
      priceConversions += 1
      return 100 - price
    },
  }
  const chart = {
    timeScale: () => timeScale,
  }
  const attachment = attachSessionVwapBandSeriesPrimitive(series as never, context)
  primitive!.attached({
    chart: chart as never,
    series: series as never,
    requestUpdate: () => {
      requests += 1
    },
  })
  return {
    attachment,
    getPrimitive: () => primitive!,
    requests: () => requests,
    resetRequests: () => {
      requests = 0
    },
    timeConversions: () => timeConversions,
    priceConversions: () => priceConversions,
    resetConversions: () => {
      timeConversions = 0
      priceConversions = 0
    },
    setVisibleWindow: (window: SessionVwapBandVisibleWindow) => {
      visibleWindow = window
    },
  }
}

function renderedFills(primitive: CapturedPrimitive): {
  fillStyles: string[]
  polygons: number[][]
} {
  const view = primitive.paneViews()[0]
  view.update()
  const renderer = view.renderer()
  if (!renderer) return { fillStyles: [], polygons: [] }

  const fillStyles: string[] = []
  const polygons: number[][] = []
  let fillStyle = ''
  let polygon: number[] = []

  const context = {
    save: () => {},
    restore: () => {},
    beginPath: () => {
      polygon = []
    },
    rect: () => {},
    clip: () => {},
    moveTo: (x: number, y: number) => {
      polygon.push(x, y)
    },
    lineTo: (x: number, y: number) => {
      polygon.push(x, y)
    },
    closePath: () => {},
    fill: () => {
      fillStyles.push(fillStyle)
      polygons.push(polygon)
    },
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
    },
  }
  renderer.draw({
    useBitmapCoordinateSpace: (callback: (scope: unknown) => void) => {
      callback({
        context,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
        bitmapSize: { width: 100, height: 100 },
      })
    },
  })
  return { fillStyles, polygons }
}

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
        getVisibleRange: () => ({ from: 10, to: 10 }),
        options: () => ({ barSpacing: 6 }),
      }),
    }

    const primitive = new SessionVwapBandSeriesPrimitive(() => ({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: false,
      fillStyle: 'rgba(1, 2, 3, 0.25)',
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
      fillStyle: 'rgba(1, 2, 3, 0.25)',
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
      fillStyle: 'rgba(1, 2, 3, 0.25)',
    }))
    primitive.attached({
      chart: {
        timeScale: () => ({
          timeToCoordinate: (time: number) => time,
          getVisibleRange: () => ({ from: 10, to: 20 }),
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

  it('library-driven updateAllViews rebuilds geometry without requesting a redraw', () => {
    const harness = createPrimitiveHarness({
      points: linearPoints(10),
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    harness.resetRequests()
    harness.resetConversions()

    harness.getPrimitive().updateAllViews()

    assert.equal(harness.requests(), 0)
    assert.deepEqual(renderedFills(harness.getPrimitive()).fillStyles, [
      'rgba(163, 163, 163, 0.25)',
    ])
    assert.equal(harness.timeConversions(), 2)
    assert.equal(harness.priceConversions(), 4)
  })

  it('external setters and public update schedule exactly one redraw each', () => {
    const harness = createPrimitiveHarness({
      points: linearPoints(10),
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })

    harness.resetRequests()
    harness.attachment.updateBandData(linearPoints(10))
    assert.equal(harness.requests(), 1)

    harness.resetRequests()
    harness.attachment.setBandVisible(true)
    assert.equal(harness.requests(), 1)

    harness.resetRequests()
    harness.attachment.setFillStyle('rgba(18, 52, 86, 0.6)')
    assert.equal(harness.requests(), 1)

    harness.resetRequests()
    harness.attachment.update()
    assert.equal(harness.requests(), 1)
  })

  it('attachment initialization schedules a redraw for the first paint', () => {
    const harness = createPrimitiveHarness({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })

    assert.equal(harness.requests(), 1)
    assert.equal(renderedFills(harness.getPrimitive()).fillStyles.length, 1)
  })

  it('hidden and disabled attachments neither convert coordinates nor request redraws', () => {
    const harness = createPrimitiveHarness({
      points: linearPoints(10),
      visible: false,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    harness.resetRequests()
    harness.resetConversions()

    harness.getPrimitive().updateAllViews()

    assert.equal(harness.requests(), 0)
    assert.equal(harness.timeConversions(), 0)
    assert.equal(harness.priceConversions(), 0)
    assert.deepEqual(renderedFills(harness.getPrimitive()), { fillStyles: [], polygons: [] })

    harness.resetRequests()
    harness.attachment.setBandVisible(false)
    assert.equal(harness.requests(), 1)
    assert.equal(harness.timeConversions(), 0)
  })

  it('rebuilds the model against the current visible window on the next library update', () => {
    const harness = createPrimitiveHarness({
      points: linearPoints(10),
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    harness.resetRequests()
    harness.resetConversions()
    harness.setVisibleWindow({ fromTime: 4, toTime: 5 })

    harness.getPrimitive().updateAllViews()

    assert.equal(harness.requests(), 0)
    // Visible samples 4 and 5 plus neighbors 3 and 6.
    assert.equal(harness.timeConversions(), 4)

    harness.resetConversions()
    harness.setVisibleWindow({ fromTime: 8, toTime: 9 })
    harness.getPrimitive().updateAllViews()
    // Visible samples 8 and 9 plus neighbor 7 and the clamped end.
    assert.equal(harness.timeConversions(), 3)
  })
})

describe('sessionVwapBandSeriesPrimitive fill style', () => {
  it('renders the palette default fill from the initial context', () => {
    const harness = createPrimitiveHarness({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    assert.deepEqual(renderedFills(harness.getPrimitive()).fillStyles, [
      'rgba(163, 163, 163, 0.25)',
    ])
  })

  it('updates the rendered band fill when the stored fill style changes', () => {
    const harness = createPrimitiveHarness({
      points: [{ time: 10, upper1: 12, lower1: 8 }],
      visible: true,
      fillStyle: 'rgba(163, 163, 163, 0.25)',
    })
    harness.attachment.setFillStyle('rgba(18, 52, 86, 0.6)')
    assert.deepEqual(renderedFills(harness.getPrimitive()).fillStyles, [
      'rgba(18, 52, 86, 0.6)',
    ])
  })

  it('keeps the band geometry but renders a transparent fill at 0% opacity', () => {
    const harness = createPrimitiveHarness(
      {
        points: [
          { time: 10, upper1: 12, lower1: 8 },
          { time: 20, upper1: 14, lower1: 9 },
        ],
        visible: true,
        fillStyle: 'rgba(163, 163, 163, 0.25)',
      },
      { fromTime: 10, toTime: 20 },
    )
    harness.attachment.setFillStyle('rgba(163, 163, 163, 0)')
    const fills = renderedFills(harness.getPrimitive())
    assert.deepEqual(fills.fillStyles, ['rgba(163, 163, 163, 0)'])
    assert.deepEqual(fills.polygons[0], [10, 88, 20, 86, 20, 91, 10, 92])
  })
})
