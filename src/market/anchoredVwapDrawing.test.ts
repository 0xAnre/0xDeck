import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeAnchoredVwapDrawing,
  resolveAnchoredVwapAnchorTimeFromPointer,
} from './anchoredVwapDrawing.ts'
import {
  createAnchoredVwapInstance,
  sanitizeAnchoredVwapInstances,
} from './anchoredVwapInstances.ts'
import {
  removeSelectedAnchoredVwap,
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  restoreAnchoredVwapDragAnchor,
  startAnchoredVwapAnchorDrag,
} from './anchoredVwapDrawingInteraction.ts'
import { releaseAnchoredVwapDrawingInteractionForPeerTool } from './drawingSelection.ts'
import { applyAnchoredVwapDrawingChartInteractionMode } from './anchoredVwapDrawingChartTool.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import { INITIAL_LINE_INTERACTION_STATE } from './lineInteraction.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'
import { setAnchoredVwapDrawingInstanceSeriesVisibility } from './anchoredVwapDrawingChartSeries.ts'
import { hitTestAnchoredVwapDrawings } from './anchoredVwapDrawingHitTest.ts'
import type { MarketCandle } from './types.ts'
import {
  loadWidgetAnchoredVwapInstances,
  saveWidgetAnchoredVwapInstances,
  WIDGET_ANCHORED_VWAP_INSTANCES_STORAGE_KEY,
} from '../anchoredVwapInstancesStorage.ts'

function candle(time: number, high: number, low: number, close: number, volume: number): MarketCandle {
  return {
    time,
    open: close,
    high,
    low,
    close,
    volume,
    interval: '1h',
  }
}

describe('computeAnchoredVwapDrawing', () => {
  it('includes anchor candle and uses HLC3 for VWAP', () => {
    const candles = [
      candle(100, 12, 8, 10, 100),
      candle(200, 14, 10, 12, 200),
      candle(300, 16, 12, 14, 300),
    ]
    const points = computeAnchoredVwapDrawing(candles, 200)
    assert.equal(points.length, 2)
    assert.equal(points[0].time, 200)
    const hlc3 = (14 + 10 + 12) / 3
    assert.equal(points[0].vwap, hlc3)
  })

  it('computes stdev bands for multipliers 1, 2, and 3', () => {
    const candles = [
      candle(100, 11, 9, 10, 50),
      candle(200, 13, 11, 12, 50),
      candle(300, 15, 13, 14, 100),
    ]
    const points = computeAnchoredVwapDrawing(candles, 100)
    const last = points[points.length - 1]
    assert.ok(last.vwap !== null && last.upper1 !== null && last.lower1 !== null)
    const spread1 = last.upper1 - last.vwap
    assert.ok(last.upper2 !== null && last.lower2 !== null)
    assert.ok(Math.abs(last.upper2 - last.vwap - 2 * spread1) < 1e-9)
    assert.ok(last.upper3 !== null && last.lower3 !== null)
    assert.ok(Math.abs(last.upper3 - last.vwap - 3 * spread1) < 1e-9)
  })

  it('omits values when cumulative volume is zero', () => {
    const candles = [candle(100, 10, 10, 10, 0), candle(200, 12, 12, 12, 100)]
    const points = computeAnchoredVwapDrawing(candles, 100)
    assert.equal(points[0].vwap, null)
    assert.equal(points[1].vwap !== null, true)
  })

  it('recomputes from a new anchor and drops pre-anchor bars', () => {
    const candles = [
      candle(100, 10, 10, 10, 100),
      candle(200, 20, 20, 20, 100),
      candle(300, 30, 30, 30, 100),
    ]
    const from100 = computeAnchoredVwapDrawing(candles, 100)
    const from200 = computeAnchoredVwapDrawing(candles, 200)
    assert.equal(from100.length, 3)
    assert.equal(from200.length, 2)
    assert.equal(from200[0].time, 200)
  })
})

describe('anchoredVwapInstances storage', () => {
  it('sanitizes and persists per panel', () => {
    const storage = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
      },
    })
    try {
      const instance = createAnchoredVwapInstance({ anchorTime: 1_700_000_000 })!
      saveWidgetAnchoredVwapInstances('panel-a', [instance])
      assert.equal(loadWidgetAnchoredVwapInstances('panel-a').length, 1)
      const sanitized = sanitizeAnchoredVwapInstances([
        instance,
        { id: 'avwap-dup', anchorTime: 1_700_000_100 },
        { id: 'avwap-dup', anchorTime: 1_700_000_200 },
        { bad: true },
      ])
      assert.equal(sanitized.length, 2)
      assert.ok(storage.has(WIDGET_ANCHORED_VWAP_INSTANCES_STORAGE_KEY))
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    }
  })
})

describe('anchoredVwapDrawingInteraction', () => {
  it('releases phase and selection for peer tool arming', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 1_700_000_000 })!
    const selected = {
      ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
      selectedId: instance.id,
    }
    const released = releaseAnchoredVwapDrawingInteractionForPeerTool(selected)
    assert.equal(released.selectedId, null)
    assert.equal(released.phase, 'inactive')
    const armed = releaseAnchoredVwapDrawingInteractionForPeerTool({
      ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
      phase: 'armed',
    })
    assert.equal(armed.phase, 'inactive')
    assert.equal(armed.selectedId, null)
  })

  it('locks chart navigation while dragging the anchor handle', () => {
    const options: Array<{ handleScroll: { horzTouchDrag: boolean } }> = []
    const chart = {
      applyOptions: (value: { handleScroll: { horzTouchDrag: boolean } }) => {
        options.push(value)
      },
    }

    applyAnchoredVwapDrawingChartInteractionMode(
      chart as never,
      INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_LINE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    applyAnchoredVwapDrawingChartInteractionMode(
      chart as never,
      startAnchoredVwapAnchorDrag(INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE, 'id', 100),
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_LINE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    assert.equal(options[0]?.handleScroll.horzTouchDrag, true)
    assert.equal(options[1]?.handleScroll.horzTouchDrag, false)
  })

  it('restoreAnchoredVwapDragAnchor reverts anchorTime from drag draft', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    const moved = { ...instance, anchorTime: 300 }
    const interaction = startAnchoredVwapAnchorDrag(
      { ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE, selectedId: instance.id },
      instance.id,
      100,
    )
    const restored = restoreAnchoredVwapDragAnchor(interaction, [moved])
    assert.equal(restored?.anchorTime, 100)
    assert.equal(restoreAnchoredVwapDragAnchor(interaction, [instance]), null)
  })

  it('delete removes unlocked selection only', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 1_700_000_000 })!
    const locked = { ...instance, locked: true }
    const state = { ...INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE, selectedId: locked.id }
    const lockedResult = removeSelectedAnchoredVwap(state, [locked])
    assert.equal(lockedResult.instances.length, 1)
    const unlockedResult = removeSelectedAnchoredVwap(
      { ...state, selectedId: instance.id },
      [instance],
    )
    assert.equal(unlockedResult.instances.length, 0)
  })
})

describe('resolveAnchoredVwapAnchorTimeFromPointer', () => {
  it('snaps to the latest bar at or before the pointer time', () => {
    const candles = [candle(100, 1, 1, 1, 1), candle(200, 2, 2, 2, 1)]
    assert.equal(resolveAnchoredVwapAnchorTimeFromPointer(candles, 150), 100)
    assert.equal(resolveAnchoredVwapAnchorTimeFromPointer(candles, 200), 200)
  })
})

describe('hitTestAnchoredVwapDrawings', () => {
  it('prefers the newest overlapping unselected instance', () => {
    const older = createAnchoredVwapInstance({ anchorTime: 100 })!
    older.displaySequence = 1
    const newer = createAnchoredVwapInstance({ anchorTime: 200 })!
    newer.displaySequence = 2
    const hit = hitTestAnchoredVwapDrawings(
      [older, newer],
      null,
      50,
      10,
      () => ({
        anchorX: 50,
        anchorY: 10,
        bodySegments: [],
      }),
    )
    assert.equal(hit?.instanceId, newer.id)
  })
})

describe('setAnchoredVwapDrawingInstanceSeriesVisibility', () => {
  it('hides band series when pair visibility is off', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 1_700_000_000 })!
    instance.settings.band2.visible = false
    const visibility: boolean[] = []
    const bundle = {
      center: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
      bands: {
        upper1: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
        lower1: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
        upper2: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
        lower2: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
        upper3: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
        lower3: { applyOptions: (opts: { visible?: boolean }) => visibility.push(opts.visible === true) },
      },
      ordered: [],
    }
    setAnchoredVwapDrawingInstanceSeriesVisibility(bundle as never, instance, 'Anchored VWAP 1')
    assert.equal(visibility.filter(Boolean).length, 3)
  })
})
