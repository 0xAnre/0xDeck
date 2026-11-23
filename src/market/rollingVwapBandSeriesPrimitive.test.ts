import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PriceScaleMode, type IChartApi, type ISeriesApi, type ISeriesPrimitive } from 'lightweight-charts'
import {
  attachRollingVwapBandSeriesPrimitive,
  RollingVwapBandSeriesPrimitive,
  type RollingVwapBandSeriesPrimitiveContext,
} from './rollingVwapBandSeriesPrimitive.ts'
import {
  resolveRollingVwapBandPrimitiveStyle,
  type RollingVwapBandPairKey,
} from './rollingVwapBandRenderGeometry.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'

const T0 = 1_700_000_000
const STEP = 60
const BAR_SPACING = 6

function point(index: number, overrides: Partial<RollingVwapPoint> = {}): RollingVwapPoint {
  const base = 100 + index
  return {
    time: T0 + index * STEP,
    vwap: base,
    stdev: 1,
    upper1: base + 1,
    lower1: base - 1,
    upper2: base + 2,
    lower2: base - 2,
    upper3: base + 3,
    lower3: base - 3,
    ...overrides,
  }
}

function points(count: number): RollingVwapPoint[] {
  return Array.from({ length: count }, (_, index) => point(index))
}

type HarnessOptions = {
  points?: RollingVwapPoint[]
  fromIndex?: number
  toIndex?: number
  mode?: PriceScaleMode
  visible?: boolean
  bandVisible?: Record<RollingVwapBandPairKey, boolean>
}

function createHarness(options: HarnessOptions = {}) {
  const source = options.points ?? points(12)
  const fromIndex = options.fromIndex ?? 2
  const toIndex = options.toIndex ?? 8
  const mode = options.mode ?? PriceScaleMode.Normal
  let requests = 0
  let timeConversions = 0
  let priceConversions = 0
  let detached = false
  let primitive: RollingVwapBandSeriesPrimitive | null = null
  const priceInputs: number[] = []

  const series = {
    priceToCoordinate: (price: number) => {
      priceConversions += 1
      priceInputs.push(price)
      return 1000 - price
    },
    priceScale: () => ({ options: () => ({ mode }) }),
    barsInLogicalRange: (range: { from: number; to: number }) => {
      const from = source[Math.max(0, Math.round(range.from))]
      const to = source[Math.min(source.length - 1, Math.round(range.to))]
      return {
        from: from ? from.time : null,
        to: to ? to.time : null,
        barsBefore: range.from,
        barsAfter: source.length - 1 - range.to,
      }
    },
    attachPrimitive: (attached: ISeriesPrimitive) => {
      primitive = attached as RollingVwapBandSeriesPrimitive
    },
    detachPrimitive: () => {
      detached = true
    },
  } as unknown as ISeriesApi<'Line'>

  const chart = {
    timeScale: () => ({
      getVisibleRange: () => ({
        from: T0 + fromIndex * STEP,
        to: T0 + toIndex * STEP,
      }),
      timeToCoordinate: (time: number) => {
        timeConversions += 1
        return ((time - (T0 + fromIndex * STEP)) / STEP) * BAR_SPACING
      },
      options: () => ({ barSpacing: BAR_SPACING }),
    }),
  } as unknown as IChartApi

  const bandVisible = options.bandVisible ?? { band1: true, band2: true, band3: true }
  const context: RollingVwapBandSeriesPrimitiveContext = {
    points: source,
    visible: options.visible ?? true,
    bandVisible,
    style: resolveRollingVwapBandPrimitiveStyle(createDefaultRollingVwapSettings()),
    haloPart: null,
  }
  const attachment = attachRollingVwapBandSeriesPrimitive(series, context)
  primitive!.attached({
    chart,
    series,
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
    detached: () => detached,
    timeConversions: () => timeConversions,
    priceConversions: () => priceConversions,
    resetConversions: () => {
      timeConversions = 0
      priceConversions = 0
    },
    priceInputs,
    source,
    chart,
    series,
  }
}

type CanvasRecord = {
  fills: { fillStyle: string; vertices: number[] }[]
  strokes: { strokeStyle: string; lineWidth: number; dash: number[]; vertices: number[] }[]
  saves: number
  restores: number
  clears: number
}

function recordCanvas(renderer: { draw: (target: unknown) => void }): CanvasRecord {
  const record: CanvasRecord = { fills: [], strokes: [], saves: 0, restores: 0, clears: 0 }
  let vertices: number[] = []
  let fillStyle = ''
  let strokeStyle = ''
  let lineWidth = 0
  let dash: number[] = []
  const context = {
    save: () => {
      record.saves += 1
    },
    restore: () => {
      record.restores += 1
    },
    beginPath: () => {
      vertices = []
      record.clears += 1
    },
    rect: () => {},
    clip: () => {},
    closePath: () => {},
    moveTo: (x: number, y: number) => {
      vertices.push(x, y)
    },
    lineTo: (x: number, y: number) => {
      vertices.push(x, y)
    },
    fill: () => {
      record.fills.push({ fillStyle, vertices: vertices.slice() })
    },
    stroke: () => {
      record.strokes.push({ strokeStyle, lineWidth, dash: dash.slice(), vertices: vertices.slice() })
    },
    setLineDash: (pattern: number[]) => {
      dash = pattern
    },
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
    },
    get strokeStyle() {
      return strokeStyle
    },
    set strokeStyle(value: string) {
      strokeStyle = value
    },
    get lineWidth() {
      return lineWidth
    },
    set lineWidth(value: number) {
      lineWidth = value
    },
  }
  renderer.draw({
    useBitmapCoordinateSpace: (callback: (scope: unknown) => void) => {
      callback({
        context,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
        bitmapSize: { width: 800, height: 500 },
      })
    },
    useMediaCoordinateSpace: (callback: (scope: unknown) => void) => {
      callback({ context, mediaSize: { width: 800, height: 500 } })
    },
  })
  return record
}

function viewByZOrder(primitive: RollingVwapBandSeriesPrimitive, zOrder: string) {
  const view = primitive.paneViews().find((candidate) => candidate.zOrder?.() === zOrder)
  assert.ok(view, `pane view with zOrder ${zOrder}`)
  return view
}

function rendererOf(primitive: RollingVwapBandSeriesPrimitive, zOrder: string) {
  return viewByZOrder(primitive, zOrder).renderer()
}

describe('rolling VWAP band primitive lifecycle', () => {
  it('requests one update on attach and never from updateAllViews', () => {
    const harness = createHarness()
    assert.equal(harness.requests(), 1)
    harness.primitive().updateAllViews()
    harness.primitive().updateAllViews()
    harness.primitive().updateAllViews()
    assert.equal(harness.requests(), 1)
  })

  it('requests exactly one update per external setter and none for unchanged state', () => {
    const harness = createHarness()
    harness.resetRequests()

    harness.attachment.setPoints(points(20))
    assert.equal(harness.requests(), 1)

    harness.attachment.updateLastPoint(point(19, { vwap: 999 }))
    assert.equal(harness.requests(), 2)

    harness.attachment.setStyle(resolveRollingVwapBandPrimitiveStyle(createDefaultRollingVwapSettings()))
    assert.equal(harness.requests(), 3)

    harness.attachment.setHaloPart('band1')
    assert.equal(harness.requests(), 4)
    harness.attachment.setHaloPart('band1')
    assert.equal(harness.requests(), 4)

    harness.attachment.setVisibility(true, { band1: true, band2: true, band3: true })
    assert.equal(harness.requests(), 4)
    harness.attachment.setVisibility(true, { band1: true, band2: false, band3: true })
    assert.equal(harness.requests(), 5)
  })

  it('stops scheduling anything after dispose', () => {
    const harness = createHarness()
    harness.attachment.dispose()
    assert.equal(harness.detached(), true)
    harness.resetRequests()
    harness.attachment.setPoints(points(20))
    harness.attachment.setHaloPart('band2')
    harness.attachment.updateLastPoint(point(30))
    assert.equal(harness.requests(), 0)
    harness.primitive().updateAllViews()
    assert.equal(rendererOf(harness.primitive(), 'normal'), null)
  })

  it('renders nothing while hidden or empty and never rebuilds unbounded work', () => {
    const hidden = createHarness({ visible: false })
    hidden.primitive().updateAllViews()
    assert.equal(rendererOf(hidden.primitive(), 'bottom'), null)
    assert.equal(rendererOf(hidden.primitive(), 'normal'), null)
    assert.equal(rendererOf(hidden.primitive(), 'top'), null)

    const empty = createHarness({ points: [] })
    empty.primitive().updateAllViews()
    assert.equal(rendererOf(empty.primitive(), 'normal'), null)
  })

  it('visits only the visible window plus neighbours at large history sizes', () => {
    const harness = createHarness({ points: points(20_000), fromIndex: 10_000, toIndex: 10_039 })
    harness.primitive().updateAllViews()
    const stats = harness.primitive().stats()
    assert.ok(stats.visitedPoints <= 42, `visited ${stats.visitedPoints}`)
    assert.equal(harness.timeConversions() <= 42, true)
  })
})

describe('rolling VWAP band primitive views', () => {
  it('draws three fills, six outlines and no halo by default', () => {
    const harness = createHarness()
    harness.primitive().updateAllViews()

    const fills = recordCanvas(rendererOf(harness.primitive(), 'bottom')!)
    assert.equal(fills.fills.length, 3)
    assert.equal(fills.saves, 1)
    assert.equal(fills.restores, 1)

    const outlines = recordCanvas(rendererOf(harness.primitive(), 'normal')!)
    assert.equal(outlines.strokes.length, 6)
    assert.ok(outlines.strokes[0].strokeStyle.startsWith('rgba('))
    assert.equal(outlines.strokes[0].lineWidth, 1)
    assert.deepEqual(outlines.strokes[0].dash, [])

    assert.equal(rendererOf(harness.primitive(), 'top'), null)
  })

  it('draws a dotted outline with the library dash pattern', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.bandLineStyles = { band1: 'dotted', band2: 'dotted', band3: 'dotted' }
    settings.bandLineWidths = { band1: 2, band2: 2, band3: 2 }
    const harness = createHarness()
    harness.attachment.setStyle(resolveRollingVwapBandPrimitiveStyle(settings))
    harness.primitive().updateAllViews()
    const outlines = recordCanvas(rendererOf(harness.primitive(), 'normal')!)
    assert.equal(outlines.strokes.length, 6)
    assert.deepEqual(outlines.strokes[0].dash, [2, 2])
    assert.equal(outlines.strokes[0].lineWidth, 2)
  })

  it('paints the selected band halo above the outlines', () => {
    const harness = createHarness()
    harness.attachment.setHaloPart('band3')
    harness.primitive().updateAllViews()
    const halo = recordCanvas(rendererOf(harness.primitive(), 'top')!)
    assert.equal(halo.strokes.length, 2)
    // width + OVERLAY_SELECTION_HALO_EXTRA_WIDTH_PX (5), global alpha 0.3.
    assert.equal(halo.strokes[0].lineWidth, 6)
  })

  it('skips a zero-multiplier band in fills, outlines and hit testing', () => {
    const harness = createHarness({
      bandVisible: { band1: false, band2: true, band3: false },
    })
    harness.primitive().updateAllViews()
    const fills = recordCanvas(rendererOf(harness.primitive(), 'bottom')!)
    assert.equal(fills.fills.length, 1)
    const outlines = recordCanvas(rendererOf(harness.primitive(), 'normal')!)
    assert.equal(outlines.strokes.length, 2)
    // The band-2 outline is drawn at 1000 - (base + 2).
    const models = harness.primitive()
    assert.equal(models.hitTestBandAt(0, 1000 - 104)?.band, 'band2')
  })
})

describe('rolling VWAP band primitive autoscale', () => {
  it('merges every visible band value for the logical range', () => {
    const harness = createHarness({ points: points(20) })
    // Logical range 2..6 maps to point times 2..6 in the fake series.
    const info = harness.primitive().autoscaleInfo(2, 6)
    assert.ok(info)
    // lower3 at index 2 = 99; upper3 at index 6 = 109.
    assert.deepEqual(info.priceRange, { minValue: 99, maxValue: 109 })
  })

  it('returns null for a zero-multiplier-only instance or a missing bar range', () => {
    const hiddenBands = createHarness({
      bandVisible: { band1: false, band2: false, band3: false },
    })
    assert.equal(hiddenBands.primitive().autoscaleInfo(2, 6), null)
  })

  it('projects percentage mode through each outline base and the centre base', () => {
    const harness = createHarness({ points: points(6), mode: PriceScaleMode.Percentage })
    const info = harness.primitive().autoscaleInfo(2, 3)
    assert.ok(info)
    const range = info.priceRange as { minValue: number; maxValue: number }
    // Same union as the geometry test: raw 99..106 after projection.
    assert.ok(Math.abs(range.minValue - 99) < 1e-9)
    assert.ok(Math.abs(range.maxValue - 106) < 1e-9)
  })

  it('feeds projected values to the native price conversion in percentage mode', () => {
    const harness = createHarness({
      points: points(6),
      mode: PriceScaleMode.Percentage,
      fromIndex: 2,
      toIndex: 3,
    })
    harness.primitive().updateAllViews()
    // Centre base 102, upper1 base 103 -> projected value 104 * 102 / 103.
    assert.ok(
      harness.priceInputs.some((value) => Math.abs(value - (104 * 102) / 103) < 1e-9),
      `projected values: ${harness.priceInputs.slice(0, 12).join(',')}`,
    )
  })

  it('keeps absolute coordinates untouched', () => {
    const harness = createHarness({ fromIndex: 2, toIndex: 3 })
    harness.primitive().updateAllViews()
    assert.ok(harness.priceInputs.includes(104))
  })
})

describe('rolling VWAP band primitive hit test', () => {
  it('returns the official primitive hover item for a band outline', () => {
    const harness = createHarness({ fromIndex: 2, toIndex: 6 })
    harness.primitive().updateAllViews()
    const hit = harness.primitive().hitTest(2 * BAR_SPACING, 1000 - 107)
    assert.equal(hit?.externalId, 'band3')
    assert.equal(hit?.zOrder, 'normal')
    assert.equal(hit?.cursorStyle, 'pointer')
  })

  it('returns null away from every outline and after dispose', () => {
    const harness = createHarness({ fromIndex: 2, toIndex: 6 })
    assert.equal(harness.primitive().hitTest(3 * BAR_SPACING, 0), null)
    harness.attachment.dispose()
    assert.equal(harness.primitive().hitTest(2 * BAR_SPACING, 1000 - 107), null)
  })
})

describe('rolling VWAP band primitive live data', () => {
  it('replaces the latest point and appends a new bar without rewriting history', () => {
    const harness = createHarness({
      points: [point(0), point(1)],
      fromIndex: 0,
      toIndex: 1,
    })
    harness.attachment.updateLastPoint(point(1, { upper1: 999 }))
    harness.primitive().updateAllViews()
    // The drawn upper1 run ends at the patched value.
    const outline = harness.primitive().hitTestBandAt(BAR_SPACING, 1000 - 999)
    assert.equal(outline?.band, 'band1')

    harness.attachment.updateLastPoint(point(2))
    harness.primitive().updateAllViews()
    const models = harness.primitive().stats()
    assert.ok(models.outlineRuns >= 6)
  })

  it('ignores a stale point without requesting a redraw', () => {
    const harness = createHarness({
      points: [point(2), point(3)],
      fromIndex: 0,
      toIndex: 1,
    })
    harness.resetRequests()
    harness.attachment.updateLastPoint(point(1))
    assert.equal(harness.requests(), 0)
  })
})
