import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  registerCandleChartSeries,
} from './candlePane.ts'
import { registerChartPaneRoleSeries } from './chartPaneRoles.ts'
import {
  RIGHT_DRAG_CONTEXT_MENU_TAIL_MS,
  attachRightDragChartScaling,
} from './rightDragChartScalingPointer.ts'
import { anchorFractionOfRange } from './rightDragChartScaling.ts'
import { isFixedRangeVolumeProfileChartInteractionLocked } from './fixedRangeVolumeProfileChartTool.ts'
import { armFixedRangeVolumeProfileTool } from './fixedRangeVolumeProfileInteraction.ts'

type FakeElement = {
  listeners: Map<string, Set<EventListener>>
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
  getBoundingClientRect: () => DOMRect
  hasListener: (type: string) => boolean
  fire: (type: string, event: Event) => void
  setPointerCapture: (pointerId: number) => void
  hasPointerCapture: (pointerId: number) => boolean
  releasePointerCapture: (pointerId: number) => void
  capturedPointerIds: Set<number>
}

function createFakeElement(top = 0, width = 400, height = 200): FakeElement {
  const listeners = new Map<string, Set<EventListener>>()
  const capturedPointerIds = new Set<number>()
  return {
    listeners,
    capturedPointerIds,
    addEventListener: (type, listener) => {
      let forType = listeners.get(type)
      if (!forType) {
        forType = new Set()
        listeners.set(type, forType)
      }
      forType.add(listener)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    getBoundingClientRect: () => ({
      left: 0,
      top,
      width,
      height,
      right: width,
      bottom: top + height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
    hasListener: (type) => (listeners.get(type)?.size ?? 0) > 0,
    fire: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
    setPointerCapture: (pointerId) => {
      capturedPointerIds.add(pointerId)
    },
    hasPointerCapture: (pointerId) => capturedPointerIds.has(pointerId),
    releasePointerCapture: (pointerId) => {
      capturedPointerIds.delete(pointerId)
    },
  }
}

type FakePane = {
  paneIndex: () => number
  getHTMLElement: () => FakeElement
}

type PointerEventLike = PointerEvent & {
  prevented: boolean
  stopped: boolean
}

function pointerEvent(props: {
  button?: number
  buttons?: number
  pointerId?: number
  clientX?: number
  clientY?: number
}): PointerEventLike {
  const button = props.button ?? 0
  const event = {
    button,
    buttons: props.buttons ?? (button === 2 || button === -1 ? 2 : 0),
    pointerId: props.pointerId ?? 1,
    clientX: props.clientX ?? 0,
    clientY: props.clientY ?? 0,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
  }
  return event as unknown as PointerEventLike
}

function mouseEvent(): MouseEvent & { prevented: boolean; stopped: boolean } {
  const event = {
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
  }
  return event as unknown as MouseEvent & { prevented: boolean; stopped: boolean }
}

function createHarness(
  options: {
    priceRange?: { from: number; to: number } | null
    scaleMargins?: { top: number; bottom: number }
  } = {},
) {
  const candleElement = createFakeElement(0)
  const rsiElement = createFakeElement(200)
  const liquidationElement = createFakeElement(300)
  const candlePane: FakePane = { paneIndex: () => 0, getHTMLElement: () => candleElement }
  const rsiPane: FakePane = { paneIndex: () => 1, getHTMLElement: () => rsiElement }
  const liquidationPane: FakePane = {
    paneIndex: () => 2,
    getHTMLElement: () => liquidationElement,
  }
  const panes = [candlePane, rsiPane, liquidationPane]

  const timeRange = { from: 100, to: 300 }
  const priceRange =
    options.priceRange === undefined ? { from: 29000, to: 31000 } : options.priceRange
  let autoScale = true
  const timeSets: { from: number; to: number }[] = []
  const priceSets: { from: number; to: number }[] = []
  const autoScaleCalls: boolean[] = []

  const timeScale = {
    getVisibleLogicalRange: () => ({ ...timeRange }),
    setVisibleLogicalRange: (range: { from: number; to: number }) => {
      timeSets.push({ ...range })
      timeRange.from = range.from
      timeRange.to = range.to
    },
    // Pane is 400px wide and shows logical 100..300.
    coordinateToLogical: (x: number) => 100 + (x / 400) * 200,
  }

  const scaleMargins = options.scaleMargins ?? { top: 0.1, bottom: 0.1 }
  const priceScale = {
    options: () => ({ scaleMargins: { ...scaleMargins } }),
    getVisibleRange: () => (priceRange ? { ...priceRange } : null),
    setVisibleRange: (range: { from: number; to: number }) => {
      priceSets.push({ ...range })
    },
    setAutoScale: (on: boolean) => {
      autoScale = on
      autoScaleCalls.push(on)
    },
  }

  const chart = {
    panes: () => panes,
    timeScale: () => timeScale,
    priceScale: () => priceScale,
  }

  const createSeries = (pane: FakePane) =>
    ({
      getPane: () => pane,
      // Pane is 200px high and shows price 31000 (top) .. 29000 (bottom).
      coordinateToPrice: (y: number) => 31000 - y * 10,
      priceToCoordinate: (price: number) => (31000 - price) / 10,
    }) as unknown as ISeriesApi<SeriesType, Time>

  const series = createSeries(candlePane)
  registerCandleChartSeries(chart as never, series)

  return {
    chart,
    candleElement,
    rsiElement,
    liquidationElement,
    candlePane,
    rsiPane,
    liquidationPane,
    series,
    createSeries,
    timeRange,
    priceRange,
    timeSets,
    priceSets,
    autoScaleCalls,
    getAutoScale: () => autoScale,
    attach: (callbacks: Partial<Parameters<typeof attachRightDragChartScaling>[1]> = {}) =>
      attachRightDragChartScaling(chart as never, {
        getSeries: () => series,
        ...callbacks,
      }),
  }
}

describe('rightDragChartScalingPointer', () => {
  it('ignores left and middle button presses', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 0, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 1, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 320, clientY: 40 }),
    )
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.candleElement.capturedPointerIds.size, 0)
    controller.dispose()
  })

  it('waits for the shared click/pan movement tolerance before scaling', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 203, clientY: 102 }),
    )
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)

    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 260, clientY: 100 }),
    )
    assert.equal(harness.timeSets.length, 1)
    controller.dispose()
  })

  it('does not mutate either range on a simple right click', () => {
    const harness = createHarness()
    const controller = harness.attach()
    const beforeTime = { ...harness.timeRange }
    const beforePrice = harness.priceRange ? { ...harness.priceRange } : null

    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointerup',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )

    assert.deepEqual(harness.timeRange, beforeTime)
    assert.deepEqual(harness.priceRange, beforePrice)
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.autoScaleCalls.length, 0)
    assert.equal(harness.candleElement.capturedPointerIds.size, 0)
    controller.dispose()
  })

  it('scales only time when dragging right, keeping price autoscale untouched', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 360, clientY: 100 }),
    )

    assert.equal(harness.timeSets.length, 1)
    const scaled = harness.timeSets[0]
    assert.ok(scaled.to - scaled.from < 200)
    assert.ok(scaled.to - scaled.from > 0)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.autoScaleCalls.length, 0)
    assert.equal(harness.getAutoScale(), true)
    controller.dispose()
  })

  it('scales only time when dragging left, keeping price autoscale untouched', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 40, clientY: 100 }),
    )

    assert.equal(harness.timeSets.length, 1)
    const scaled = harness.timeSets[0]
    assert.ok(scaled.to - scaled.from > 200)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.autoScaleCalls.length, 0)
    controller.dispose()
  })

  it('enters manual price range for a drag up and grows it for a drag down', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 200, clientY: 40 }),
    )
    assert.deepEqual(harness.autoScaleCalls, [false])
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 1)
    assert.ok(harness.priceSets[0].to - harness.priceSets[0].from < 2000)

    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 200, clientY: 190 }),
    )
    assert.equal(harness.priceSets.length, 2)
    assert.ok(harness.priceSets[1].to - harness.priceSets[1].from > 2000)
    controller.dispose()
  })

  it('applies both axes for a diagonal gesture', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 280, clientY: 40 }),
    )
    assert.equal(harness.timeSets.length, 1)
    assert.equal(harness.priceSets.length, 1)
    assert.ok(harness.timeSets[0].to - harness.timeSets[0].from < 200)
    assert.ok(harness.priceSets[0].to - harness.priceSets[0].from < 2000)
    controller.dispose()
  })

  it('keeps the pressed time and price anchor at the same fraction', () => {
    const harness = createHarness()
    const controller = harness.attach()
    // Press at x=240 → logical 220; y=120 → price 29800.
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 240, clientY: 120 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 120, clientY: 30 }),
    )

    const timeFractionBefore = anchorFractionOfRange({ from: 100, to: 300 }, 220)
    const timeFractionAfter = anchorFractionOfRange(harness.timeSets[0], 220)
    assert.ok(timeFractionBefore !== null && timeFractionAfter !== null)
    assert.ok(Math.abs(timeFractionBefore - timeFractionAfter) < 1e-9)

    const priceFractionBefore = anchorFractionOfRange({ from: 29000, to: 31000 }, 29800)
    const priceFractionAfter = anchorFractionOfRange(harness.priceSets[0], 29800)
    assert.ok(priceFractionBefore !== null && priceFractionAfter !== null)
    assert.ok(Math.abs(priceFractionBefore - priceFractionAfter) < 1e-9)
    controller.dispose()
  })

  it('stops scaling after pointer up and releases capture', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 300, clientY: 100 }),
    )
    assert.equal(harness.timeSets.length, 1)
    assert.equal(harness.candleElement.capturedPointerIds.size, 1)

    harness.candleElement.fire(
      'pointerup',
      pointerEvent({ button: 2, clientX: 300, clientY: 100 }),
    )
    assert.equal(harness.candleElement.capturedPointerIds.size, 0)

    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 10, clientY: 100 }),
    )
    assert.equal(harness.timeSets.length, 1)
    controller.dispose()
  })

  it('ends on pointercancel and on lost pointer capture', () => {
    for (const endEvent of ['pointercancel', 'lostpointercapture'] as const) {
      const harness = createHarness()
      const controller = harness.attach()
      harness.candleElement.fire(
        'pointerdown',
        pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
      )
      harness.candleElement.fire(
        'pointermove',
        pointerEvent({ button: -1, clientX: 300, clientY: 100 }),
      )
      const setsBefore = harness.timeSets.length
      harness.candleElement.fire(
        endEvent,
        pointerEvent({ button: 2, clientX: 300, clientY: 100 }),
      )
      harness.candleElement.fire(
        'pointermove',
        pointerEvent({ button: -1, clientX: 340, clientY: 100 }),
      )
      assert.equal(harness.timeSets.length, setsBefore)
      assert.equal(harness.candleElement.capturedPointerIds.size, 0)
      controller.dispose()
    }
  })

  it('suppresses the context menu for a right-button gesture and after a drag only', () => {
    const harness = createHarness()
    const controller = harness.attach()

    const idle = mouseEvent()
    harness.candleElement.fire('contextmenu', idle)
    assert.equal(idle.prevented, false)

    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    const pressed = mouseEvent()
    harness.candleElement.fire('contextmenu', pressed)
    assert.equal(pressed.prevented, true)
    assert.equal(pressed.stopped, true)

    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 300, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointerup',
      pointerEvent({ button: 2, clientX: 300, clientY: 100 }),
    )
    const afterDrag = mouseEvent()
    harness.candleElement.fire('contextmenu', afterDrag)
    assert.equal(afterDrag.prevented, true)
    assert.ok(RIGHT_DRAG_CONTEXT_MENU_TAIL_MS > 0)
    controller.dispose()
  })

  it('rebinds to the candle pane after the pane moves and ends the old gesture', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    assert.equal(harness.candleElement.hasListener('pointerdown'), true)

    const movedElement = createFakeElement(0)
    const movedPane: FakePane = { paneIndex: () => 0, getHTMLElement: () => movedElement }
    registerCandleChartSeries(harness.chart as never, harness.createSeries(movedPane))

    assert.equal(harness.candleElement.hasListener('pointerdown'), false)
    assert.equal(harness.candleElement.hasListener('contextmenu'), false)
    assert.equal(movedElement.hasListener('pointerdown'), true)
    assert.equal(movedElement.hasListener('contextmenu'), true)

    const setsBefore = harness.timeSets.length
    movedElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 320, clientY: 100 }),
    )
    assert.equal(harness.timeSets.length, setsBefore)
    controller.dispose()
  })

  it('never binds to the RSI or Aggregated Liquidations panes', () => {
    const harness = createHarness()
    registerChartPaneRoleSeries(harness.chart as never, 'rsi', harness.createSeries(harness.rsiPane))
    registerChartPaneRoleSeries(
      harness.chart as never,
      'aggregated-liquidations',
      harness.createSeries(harness.liquidationPane),
    )
    const controller = harness.attach()

    for (const element of [harness.rsiElement, harness.liquidationElement]) {
      assert.equal(element.hasListener('pointerdown'), false)
      assert.equal(element.hasListener('pointermove'), false)
      assert.equal(element.hasListener('contextmenu'), false)
      element.fire(
        'pointerdown',
        pointerEvent({ button: 2, clientX: 200, clientY: 300 }),
      )
      element.fire(
        'pointermove',
        pointerEvent({ button: -1, clientX: 320, clientY: 240 }),
      )
    }
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
    controller.dispose()
  })

  it('stays out of the way while another interaction owns navigation', () => {
    const harness = createHarness()
    const controller = harness.attach({ isBlocked: () => true })
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 320, clientY: 40 }),
    )
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.candleElement.capturedPointerIds.size, 0)
    controller.dispose()
  })

  it('does not mutate any range while a Fixed Range Volume Profile is armed', () => {
    const harness = createHarness()
    const frvp = armFixedRangeVolumeProfileTool()
    assert.equal(isFixedRangeVolumeProfileChartInteractionLocked(frvp), true)
    const controller = harness.attach({
      isBlocked: () => isFixedRangeVolumeProfileChartInteractionLocked(frvp),
    })
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 320, clientY: 40 }),
    )
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.autoScaleCalls.length, 0)
    assert.equal(harness.candleElement.capturedPointerIds.size, 0)
    controller.dispose()
  })

  it('ignores moves once the right button is no longer held', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, buttons: 0, clientX: 320, clientY: 40 }),
    )
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
    assert.equal(harness.autoScaleCalls.length, 0)
    controller.dispose()
  })

  it('derives the inner price range from pane coordinates when the scale reports none', () => {
    const harness = createHarness({ priceRange: null })
    const controller = harness.attach()
    // Press at y=130 (0.65 of the 200 px pane) → price 29 700. With 10 % top and
    // bottom margins the visible range is 29 200 … 30 800 (inner y=20 … 180),
    // so the pressed price sits 0.3125 of the way up from the range floor.
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 130 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 200, clientY: 70 }),
    )
    assert.equal(harness.priceSets.length, 1)
    assert.ok(Number.isFinite(harness.priceSets[0].from))
    assert.ok(Number.isFinite(harness.priceSets[0].to))
    assert.ok(harness.priceSets[0].from < harness.priceSets[0].to)
    const anchorFraction = anchorFractionOfRange(harness.priceSets[0], 29_700)
    assert.ok(anchorFraction !== null)
    assert.ok(Math.abs(anchorFraction - 0.3125) < 1e-9)
    controller.dispose()
  })

  it('clamps an extreme drag to a finite, non-inverted range', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 1e7, clientY: -1e7 }),
    )
    const lastTime = harness.timeSets.at(-1)
    const lastPrice = harness.priceSets.at(-1)
    assert.ok(lastTime && lastPrice)
    assert.ok(Number.isFinite(lastTime.from) && Number.isFinite(lastTime.to))
    assert.ok(Number.isFinite(lastPrice.from) && Number.isFinite(lastPrice.to))
    assert.ok(lastTime.from < lastTime.to)
    assert.ok(lastPrice.from < lastPrice.to)
    controller.dispose()
  })

  it('removes every listener on dispose and ends an active gesture', () => {
    const harness = createHarness()
    const controller = harness.attach()
    harness.candleElement.fire(
      'pointerdown',
      pointerEvent({ button: 2, clientX: 200, clientY: 100 }),
    )
    controller.dispose()

    assert.ok(
      [...harness.candleElement.listeners.values()].every((listeners) => listeners.size === 0),
    )
    assert.equal(harness.candleElement.capturedPointerIds.size, 0)

    harness.candleElement.fire(
      'pointermove',
      pointerEvent({ button: -1, clientX: 320, clientY: 40 }),
    )
    assert.equal(harness.timeSets.length, 0)
    assert.equal(harness.priceSets.length, 0)
  })
})
