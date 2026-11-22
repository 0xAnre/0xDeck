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

type AnchoredPairContext = {
  id: string
  points: readonly { time: number; upper: number | null; lower: number | null }[]
  visible: boolean
  fillStyle: string
}

type CapturedAnchoredPrimitive = {
  attached: (param: unknown) => void
  detached: () => void
  updateAllViews: () => void
}

type CapturedAnchoredView = {
  update: () => void
  renderer: () => { draw: (target: unknown) => void } | null
}

function visibleAnchoredPair(overrides: Partial<AnchoredPairContext> = {}): AnchoredPairContext {
  return {
    id: 'band1',
    points: [
      { time: 10, upper: 12, lower: 8 },
      { time: 20, upper: 14, lower: 6 },
      { time: 30, upper: 16, lower: 4 },
    ],
    visible: true,
    fillStyle: 'rgba(163, 163, 163, 0.25)',
    ...overrides,
  }
}

function createAnchoredSchedulingHarness(initialPairs: readonly AnchoredPairContext[]) {
  let primitive: CapturedAnchoredPrimitive | null = null
  let requests = 0
  let timeConversions = 0
  let priceConversions = 0
  let detachCalls = 0

  const timeScale = {
    timeToCoordinate: (time: number) => {
      timeConversions += 1
      return time
    },
    options: () => ({ barSpacing: 6 }),
  }
  const series = {
    attachPrimitive: (attached: CapturedAnchoredPrimitive) => {
      primitive = attached
    },
    detachPrimitive: () => {
      detachCalls += 1
    },
    priceToCoordinate: (price: number) => {
      priceConversions += 1
      return 100 - price
    },
    barsInLogicalRange: () => ({ from: 0 as never, to: 100 as never }),
  }
  const chart = { timeScale: () => timeScale }

  const attachment = attachAnchoredVwapBandFillSeriesPrimitive(series as never, {
    pairs: initialPairs,
  })
  primitive!.attached({
    chart: chart as never,
    series: series as never,
    requestUpdate: () => {
      requests += 1
    },
  })

  return {
    attachment,
    primitive: () => primitive!,
    requests: () => requests,
    resetRequests: () => {
      requests = 0
    },
    timeConversions: () => timeConversions,
    priceConversions: () => priceConversions,
    detachCalls: () => detachCalls,
  }
}

function renderedAnchoredFills(primitive: CapturedAnchoredPrimitive): {
  fillStyles: string[]
  polygons: number[][]
} {
  const view = (primitive as unknown as { paneViews: () => readonly CapturedAnchoredView[] }).paneViews()[0]
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

describe('anchoredVwapBandFillSeriesPrimitive scheduling', () => {
  it('library-driven updateAllViews rebuilds the fill without requesting a redraw', () => {
    const harness = createAnchoredSchedulingHarness([visibleAnchoredPair()])
    harness.resetRequests()

    harness.primitive().updateAllViews()

    assert.equal(harness.requests(), 0)
    assert.deepEqual(renderedAnchoredFills(harness.primitive()).fillStyles, [
      'rgba(163, 163, 163, 0.25)',
    ])

    harness.primitive().updateAllViews()
    assert.equal(harness.requests(), 0)
  })

  it('attachment initialization, setPairs and public update schedule exactly one redraw each', () => {
    const harness = createAnchoredSchedulingHarness([])
    assert.equal(harness.requests(), 1, 'attached must ask for the first update')

    harness.resetRequests()
    harness.attachment.setPairs([visibleAnchoredPair()])
    assert.equal(harness.requests(), 1)
    assert.deepEqual(renderedAnchoredFills(harness.primitive()).fillStyles, [
      'rgba(163, 163, 163, 0.25)',
    ])

    harness.resetRequests()
    harness.attachment.update()
    assert.equal(harness.requests(), 1)

    harness.resetRequests()
    harness.primitive().updateAllViews()
    assert.equal(harness.requests(), 0, 'the library callback never reschedules')
  })

  it('empty and hidden contexts settle without scheduling from library updates', () => {
    const empty = createAnchoredSchedulingHarness([])
    empty.resetRequests()
    empty.primitive().updateAllViews()
    assert.equal(empty.requests(), 0)
    assert.deepEqual(renderedAnchoredFills(empty.primitive()).fillStyles, [])

    const hidden = createAnchoredSchedulingHarness([visibleAnchoredPair({ visible: false })])
    hidden.resetRequests()
    hidden.primitive().updateAllViews()
    assert.equal(hidden.requests(), 0)
    assert.deepEqual(renderedAnchoredFills(hidden.primitive()).fillStyles, [])
  })

  it('dispose detaches and leaves no scheduling callback', () => {
    const harness = createAnchoredSchedulingHarness([visibleAnchoredPair()])
    harness.attachment.dispose()
    assert.equal(harness.detachCalls(), 1)

    harness.resetRequests()
    harness.attachment.setPairs([visibleAnchoredPair({ fillStyle: 'rgba(1, 2, 3, 0.4)' })])
    harness.attachment.update()
    harness.primitive().updateAllViews()
    assert.equal(harness.requests(), 0)
  })
})
