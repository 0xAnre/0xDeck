import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRollingVwapBandDrawModels,
  emptyRollingVwapBandDrawModels,
  hitTestRollingVwapBandOutlineModels,
  projectRollingVwapBandOutlineValue,
  resolveRollingVwapBandPrimitiveStyle,
  resolveRollingVwapBandProjection,
  rollingVwapBandAutoscaleRange,
  rollingVwapBandFirstIndexAfter,
  rollingVwapBandFirstIndexAtOrAfter,
  rollingVwapBandSampleWindow,
  ROLLING_VWAP_BAND_VALUE_KEYS,
  type RollingVwapBandPrimitiveStyle,
  type RollingVwapBandProjection,
  type RollingVwapBandVisibleWindow,
} from './rollingVwapBandRenderGeometry.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import { marketStyleColorWithOpacity } from './marketStylePalette.ts'

const T0 = 1_700_000_000
const STEP = 60

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

function points(count: number, overrides?: (index: number) => Partial<RollingVwapPoint>): RollingVwapPoint[] {
  return Array.from({ length: count }, (_, index) => point(index, overrides?.(index)))
}

const BAR_SPACING = 6
const ALL_BANDS = { band1: true, band2: true, band3: true }

function timeToX(time: number, fromIndex: number): number {
  return (time - (T0 + fromIndex * STEP)) / STEP * BAR_SPACING
}

function defaultStyle(): RollingVwapBandPrimitiveStyle {
  return resolveRollingVwapBandPrimitiveStyle(createDefaultRollingVwapSettings())
}

function visibleWindow(fromIndex: number, toIndex: number): RollingVwapBandVisibleWindow {
  return { fromTime: T0 + fromIndex * STEP, toTime: T0 + toIndex * STEP }
}

function buildModels(options: {
  points?: RollingVwapPoint[]
  fromIndex?: number
  toIndex?: number
  style?: RollingVwapBandPrimitiveStyle
  bandVisible?: Record<'band1' | 'band2' | 'band3', boolean>
  visible?: boolean
  projection?: RollingVwapBandProjection
  haloPart?: 'band1' | 'band2' | 'band3' | 'all' | null
  outlinePriceToY?: (key: string, value: number) => number | null
}) {
  const source = options.points ?? points(10)
  const fromIndex = options.fromIndex ?? 2
  const toIndex = options.toIndex ?? 6
  const projection = options.projection ??
    resolveRollingVwapBandProjection({
      mode: 'absolute',
      points: source,
      fromTime: T0 + fromIndex * STEP,
    })
  return buildRollingVwapBandDrawModels({
    points: source,
    visibleWindow: visibleWindow(fromIndex, toIndex),
    visible: options.visible ?? true,
    bandVisible: options.bandVisible ?? ALL_BANDS,
    style: options.style ?? defaultStyle(),
    haloPart: options.haloPart ?? null,
    barSpacing: BAR_SPACING,
    timeToX: (time) => timeToX(time, fromIndex),
    outlinePriceToY: options.outlinePriceToY ?? ((_key, value) => 1000 - value),
    fillPriceToY: (value) => 1000 - value,
    projection,
  })
}

describe('rolling VWAP band binary search and sample window', () => {
  it('finds at-or-after and strictly-after indices', () => {
    const source = points(5)
    assert.equal(rollingVwapBandFirstIndexAtOrAfter(source, T0), 0)
    assert.equal(rollingVwapBandFirstIndexAtOrAfter(source, T0 + 2 * STEP), 2)
    assert.equal(rollingVwapBandFirstIndexAtOrAfter(source, T0 + 2 * STEP + 1), 3)
    assert.equal(rollingVwapBandFirstIndexAtOrAfter(source, T0 + 100 * STEP), 5)
    assert.equal(rollingVwapBandFirstIndexAfter(source, T0 + 2 * STEP), 3)
    assert.equal(rollingVwapBandFirstIndexAfter(source, T0 + 4 * STEP), 5)
  })

  it('brackets the visible window with at most one neighbour per side', () => {
    const source = points(100)
    const window = rollingVwapBandSampleWindow(source, visibleWindow(40, 60))
    assert.deepEqual(window, { startIndex: 39, endIndex: 62 })
    assert.equal(window.endIndex - window.startIndex, 23)
  })

  it('clamps at both history edges and rejects an empty window', () => {
    const source = points(10)
    assert.deepEqual(rollingVwapBandSampleWindow(source, visibleWindow(0, 3)), {
      startIndex: 0,
      endIndex: 5,
    })
    assert.deepEqual(rollingVwapBandSampleWindow(source, visibleWindow(8, 9)), {
      startIndex: 7,
      endIndex: 10,
    })
    assert.deepEqual(rollingVwapBandSampleWindow(source, null), {
      startIndex: 0,
      endIndex: 0,
    })
    assert.deepEqual(
      rollingVwapBandSampleWindow(source, { fromTime: T0 + STEP, toTime: T0 }),
      { startIndex: 0, endIndex: 0 },
    )
  })
})

describe('rolling VWAP band first-visible projection bases', () => {
  it('uses the first fulfilled value at or after the visible start, per outline', () => {
    const source = points(6)
    source[2] = point(2, { upper1: null, lower1: null })
    const projection = resolveRollingVwapBandProjection({
      mode: 'percentage',
      points: source,
      fromTime: T0 + 2 * STEP,
    })
    assert.equal(projection.centerBase, 102)
    // upper1/lower1 skip the whitespace row exactly like a native series does.
    assert.equal(projection.bases.upper1, 104)
    assert.equal(projection.bases.lower1, 102)
    assert.equal(projection.bases.upper2, 104)
  })

  it('returns null bases when no fulfilled row exists at or after the window', () => {
    const source = points(3)
    const projection = resolveRollingVwapBandProjection({
      mode: 'percentage',
      points: source,
      fromTime: T0 + 100 * STEP,
    })
    assert.equal(projection.centerBase, null)
    for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
      assert.equal(projection.bases[key], null)
    }
  })

  it('projects percentage/indexed outlines through the centre base', () => {
    const source = points(4)
    const projection = resolveRollingVwapBandProjection({
      mode: 'percentage',
      points: source,
      fromTime: T0,
    })
    assert.equal(projection.centerBase, 100)
    assert.equal(projection.bases.upper1, 101)
    const projected = projectRollingVwapBandOutlineValue(projection, 'upper1', 105)
    assert.ok(projected !== null)
    // toPercent(projected, 100) === toPercent(105, 101)
    assert.ok(Math.abs((105 - 101) / 101 - ((projected as number) - 100) / 100) < 1e-12)

    const shifted = resolveRollingVwapBandProjection({
      mode: 'percentage',
      points: source,
      fromTime: T0 + 2 * STEP,
    })
    // Centre base 102, upper1 base 103: a native upper1 series converts the
    // value through 103; the consolidated primitive must feed value*102/103.
    const shiftedProjected = projectRollingVwapBandOutlineValue(shifted, 'upper1', 208)
    assert.ok(shiftedProjected !== null)
    assert.ok(Math.abs((shiftedProjected as number) - (208 * 102) / 103) < 1e-12)
  })

  it('draws nothing for a degenerated percentage base instead of inventing geometry', () => {
    const projection = resolveRollingVwapBandProjection({
      mode: 'percentage',
      points: points(2),
      fromTime: T0,
    })
    assert.equal(
      projectRollingVwapBandOutlineValue({ ...projection, bases: { ...projection.bases, upper1: 0 } }, 'upper1', 101),
      null,
    )
    assert.equal(
      projectRollingVwapBandOutlineValue({ ...projection, mode: 'absolute' }, 'upper1', 101),
      101,
    )
  })
})

describe('rolling VWAP band draw models', () => {
  it('draws six outlines and three fills for the visible window', () => {
    const models = buildModels({ points: points(10), fromIndex: 2, toIndex: 6 })
    assert.equal(models.outlines.length, 6)
    assert.equal(models.fills.length, 3)
    assert.equal(models.outlines[0].points.length, 7)
    assert.equal(models.fills[0].polygon.length, 7 * 4)
    // Visible window plus one neighbour each side.
    assert.equal(models.visitedPoints, 7)
  })

  it('breaks runs at null points instead of bridging the gap', () => {
    const source = points(10, (index) => (index === 4 ? { upper1: null } : {}))
    const models = buildModels({ points: source })
    const upper1 = models.outlines.filter((run) => run.key === 'upper1')
    assert.equal(upper1.length, 2)
    const [first, second] = upper1
    // Sample window indexes 1..7 with the null at index 4.
    assert.equal(first.points.length, 3)
    assert.equal(second.points.length, 3)
    // The fill needs both bounds, so the same gap splits the band-1 fill too.
    const band1Fills = models.fills.filter((fill) => fill.band === 'band1')
    assert.equal(band1Fills.length, 2)
  })

  it('skips a band whose multiplier is zero while other bands keep drawing', () => {
    const models = buildModels({
      bandVisible: { band1: false, band2: true, band3: false },
    })
    assert.deepEqual(
      models.outlines.map((run) => run.band),
      ['band2', 'band2'],
    )
    assert.deepEqual(models.fills.map((fill) => fill.band), ['band2'])
  })

  it('draws nothing when the instance is hidden or the model is empty', () => {
    const hidden = buildModels({ visible: false })
    assert.deepEqual(hidden, emptyRollingVwapBandDrawModels())
    const empty = buildModels({ points: [] })
    assert.deepEqual(empty, emptyRollingVwapBandDrawModels())
  })

  it('applies per-band color, width and dotted style independently', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.bandColors = { band1: '#111111', band2: '#222222', band3: '#333333' }
    settings.bandOpacities = { band1: 100, band2: 50, band3: 20 }
    settings.bandLineWidths = { band1: 1, band2: 3, band3: 4 }
    settings.bandLineStyles = { band1: 'solid', band2: 'dotted', band3: 'dotted' }
    const models = buildModels({ style: resolveRollingVwapBandPrimitiveStyle(settings) })
    const byKey = new Map(models.outlines.map((run) => [run.key, run]))
    assert.equal(byKey.get('upper1')?.style.widthPx, 1)
    assert.equal(byKey.get('upper1')?.style.lineStyle, 'solid')
    assert.equal(byKey.get('lower2')?.style.widthPx, 3)
    assert.equal(byKey.get('lower2')?.style.lineStyle, 'dotted')
    assert.equal(
      byKey.get('upper3')?.style.color,
      marketStyleColorWithOpacity('#333333', 20),
    )
  })

  it('keeps opacity zero as a drawn but transparent outline/fill (not a hidden band)', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.bandOpacities = { band1: 0, band2: 0, band3: 0 }
    settings.fillOpacity = 0
    const models = buildModels({ style: resolveRollingVwapBandPrimitiveStyle(settings) })
    assert.equal(models.outlines.length, 6)
    assert.equal(models.fills.length, 3)
    assert.match(models.outlines[0].style.color, /rgba\(.*0\)$/)
    assert.match(models.fills[0].fillStyle, /rgba\(.*0\)$/)
  })

  it('draws a half-bar segment for a single visible item and a one-item fill', () => {
    const models = buildModels({ points: points(1), fromIndex: 0, toIndex: 0 })
    assert.equal(models.outlines.length, 6)
    assert.equal(models.outlines[0].points.length, 2)
    assert.equal(models.outlines[0].points[0].x, -BAR_SPACING / 2)
    assert.equal(models.outlines[0].points[1].x, BAR_SPACING / 2)
    assert.equal(models.fills.length, 3)
    assert.equal(models.fills[0].polygon.length, 8)
  })

  it('draws the native single-item half-bar when only one fulfilled point is visible', () => {
    const source = points(9, (index) =>
      index === 3 || index === 5 ? { upper1: null, lower1: null } : {},
    )
    const models = buildModels({ points: source, fromIndex: 4, toIndex: 4 })
    const upper1 = models.outlines.filter((run) => run.key === 'upper1')
    assert.equal(upper1.length, 1)
    assert.equal(upper1[0].points.length, 2)
    // Other bands still have their neighbours, so they draw polylines.
    const lower2 = models.outlines.find((run) => run.key === 'lower2')
    assert.ok((lower2?.points.length ?? 0) >= 2)
  })

  it('halos only the selected band pair with its own color and outline width', () => {
    const models = buildModels({ haloPart: 'band2' })
    assert.equal(models.halo.length, 2)
    assert.deepEqual(
      models.halo.map((stroke) => stroke.band),
      ['band2', 'band2'],
    )
    const upper2 = models.outlines.find((run) => run.key === 'upper2')
    assert.equal(models.halo[0].color, upper2?.style.color)
    assert.equal(models.halo[0].widthPx, upper2?.style.widthPx)
    assert.deepEqual(models.halo[0].points, upper2?.points)
  })

  it('halos every visible band for a whole-instance selection', () => {
    const models = buildModels({
      haloPart: 'all',
      bandVisible: { band1: true, band2: false, band3: true },
    })
    assert.deepEqual(
      models.halo.map((stroke) => stroke.band),
      ['band1', 'band1', 'band3', 'band3'],
    )
  })
})

describe('rolling VWAP band autoscale', () => {
  it('merges every visible outline value inside the visible window', () => {
    const source = points(10)
    const range = rollingVwapBandAutoscaleRange({
      points: source,
      visibleWindow: visibleWindow(2, 6),
      bandVisible: ALL_BANDS,
      projection: resolveRollingVwapBandProjection({ mode: 'absolute', points: source, fromTime: T0 + 2 * STEP }),
    })
    // lower3 at index 2 is 99; upper3 at index 6 is 109.
    assert.deepEqual(range, { minValue: 99, maxValue: 109 })
  })

  it('adds no range for zero-multiplier bands or an empty window', () => {
    const source = points(10)
    const projection = resolveRollingVwapBandProjection({
      mode: 'absolute',
      points: source,
      fromTime: T0 + 2 * STEP,
    })
    assert.equal(
      rollingVwapBandAutoscaleRange({
        points: source,
        visibleWindow: visibleWindow(2, 6),
        bandVisible: { band1: false, band2: false, band3: false },
        projection,
      }),
      null,
    )
    assert.equal(
      rollingVwapBandAutoscaleRange({
        points: source,
        visibleWindow: visibleWindow(50, 60),
        bandVisible: ALL_BANDS,
        projection,
      }),
      null,
    )
  })

  it('merges percentage ranges per outline base and the fill through the centre base', () => {
    const source = points(4)
    const window = visibleWindow(2, 3)
    const projection = resolveRollingVwapBandProjection({
      mode: 'percentage',
      points: source,
      fromTime: T0 + 2 * STEP,
    })
    const range = rollingVwapBandAutoscaleRange({
      points: source,
      visibleWindow: window,
      bandVisible: ALL_BANDS,
      projection,
    })
    // Outline ratios use each outline's own first visible base; the fill
    // contribution uses the centre base (102). The merged range therefore
    // spans the raw values 99..106 after projection through 102.
    const resolved = range as { minValue: number; maxValue: number }
    assert.ok(Math.abs(resolved.minValue - 99) < 1e-9)
    assert.ok(Math.abs(resolved.maxValue - 106) < 1e-9)
  })

  it('reports no range when the centre conversion base is missing', () => {
    const source = points(4, (index) => (index >= 2 ? { vwap: null } : {}))
    const projection = resolveRollingVwapBandProjection({
      mode: 'indexed-to-100',
      points: source,
      fromTime: T0 + 2 * STEP,
    })
    assert.equal(projection.centerBase, null)
    assert.equal(
      rollingVwapBandAutoscaleRange({
        points: source,
        visibleWindow: visibleWindow(2, 3),
        bandVisible: ALL_BANDS,
        projection,
      }),
      null,
    )
  })
})

describe('rolling VWAP band hit testing', () => {
  it('returns the nearest outline band within tolerance', () => {
    const models = buildModels({ points: points(10), fromIndex: 2, toIndex: 6 })
    const upper2 = models.outlines.find((run) => run.key === 'upper2')
    assert.ok(upper2)
    const target = upper2.points[2]
    const hit = hitTestRollingVwapBandOutlineModels(models, target.x, target.y)
    assert.equal(hit?.band, 'band2')
    assert.ok((hit?.distance ?? 99) < 1)
  })

  it('returns null outside the hit radius and above the empty pane', () => {
    const models = buildModels({ points: points(10), fromIndex: 2, toIndex: 6 })
    const upper2 = models.outlines.find((run) => run.key === 'upper2')
    assert.ok(upper2)
    const target = upper2.points[2]
    assert.equal(
      hitTestRollingVwapBandOutlineModels(models, target.x, target.y + 40),
      null,
    )
  })

  it('cannot hit a band whose multiplier is zero', () => {
    const models = buildModels({
      points: points(10),
      fromIndex: 2,
      toIndex: 6,
      bandVisible: { band1: false, band2: false, band3: false },
    })
    assert.equal(hitTestRollingVwapBandOutlineModels(models, 100, 100), null)
  })
})
