import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  INITIAL_LINE_INTERACTION_STATE,
  isLineDrawingBlockingPeerTools,
  type LineInteractionState,
} from './lineInteraction.ts'
import { attachLinePanePointer } from './linePanePointer.ts'
import {
  INITIAL_RECTANGLE_INTERACTION_STATE,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import { attachRectanglePanePointer } from './rectanglePanePointer.ts'

function createPaneHarness() {
  const listeners = new Map<string, EventListener[]>()
  const paneElement = {
    addEventListener: (type: string, listener: EventListener) => {
      const next = listeners.get(type) ?? []
      next.push(listener)
      listeners.set(type, next)
    },
    removeEventListener: (type: string, listener: EventListener) => {
      const next = (listeners.get(type) ?? []).filter((item) => item !== listener)
      listeners.set(type, next)
    },
    hasPointerCapture: () => true,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
      right: 400,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    focus: () => {},
    tabIndex: -1,
  } as unknown as HTMLElement

  const chart = {
    panes: () => [{ getHTMLElement: () => paneElement }],
    timeScale: () => ({
      coordinateToTime: () => 150,
      coordinateToLogical: (x: number) => x,
      timeToIndex: () => 1,
      logicalToCoordinate: (logical: number) => logical,
      timeToCoordinate: (time: number) => time,
    }),
  }

  return { listeners, chart }
}

describe('linePanePointer', () => {
  it('starts moving a line that overlaps a rectangle fill', () => {
    const { listeners, chart } = createPaneHarness()
    let phase: string = INITIAL_LINE_INTERACTION_STATE.phase

    attachLinePanePointer(chart as never, {
      getSnapshot: () => ({
        interaction: INITIAL_LINE_INTERACTION_STATE,
        instances: [
          {
            id: 'line-1',
            timeA: 100,
            priceA: 50,
            timeB: 200,
            priceB: 50,
          },
        ],
      }),
      getChart: () => chart as never,
      getSeries: () =>
        ({
          coordinateToPrice: (y: number) => 100 - y,
          priceToCoordinate: (price: number) => 100 - price,
          data: () => [{ time: 100 }, { time: 200 }],
        }) as never,
      onInteractionChange: (next) => {
        phase = next.phase
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingRectangleHit: () => ({
        instanceId: 'rect-1',
        kind: 'interior',
        priority: 1,
        instanceIndex: 0,
      }),
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 200,
    })

    listeners.get('pointerdown')?.[0]?.({
      button: 0,
      clientX: 150,
      clientY: 50,
      pointerId: 4,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)

    assert.equal(phase, 'moving')
  })

  it('lets the line win when the rectangle listener is registered first', () => {
    const { listeners, chart } = createPaneHarness()
    let lineInteraction: LineInteractionState = INITIAL_LINE_INTERACTION_STATE
    let rectangleInteraction: RectangleInteractionState = {
      ...INITIAL_RECTANGLE_INTERACTION_STATE,
      selectedId: 'rect-1',
    }
    const series = {
      coordinateToPrice: (y: number) => 100 - y,
      priceToCoordinate: (price: number) => 100 - price,
      data: () => [{ time: 100 }, { time: 200 }],
    }
    const rectangle = {
      id: 'rect-1',
      fromTime: 100,
      toTime: 200,
      lowPrice: 20,
      highPrice: 80,
    }
    const line = {
      id: 'line-1',
      timeA: 100,
      priceA: 50,
      timeB: 200,
      priceB: 50,
    }

    attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({ interaction: rectangleInteraction, instances: [rectangle] }),
      getChart: () => chart as never,
      getSeries: () => series as never,
      onInteractionChange: (next) => {
        rectangleInteraction = next
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => isLineDrawingBlockingPeerTools(lineInteraction),
      getCompetingLineHit: () => ({
        instanceId: 'line-1',
        kind: 'body',
        priority: 1,
        instanceIndex: 0,
      }),
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 200,
    })
    attachLinePanePointer(chart as never, {
      getSnapshot: () => ({ interaction: lineInteraction, instances: [line] }),
      getChart: () => chart as never,
      getSeries: () => series as never,
      onInteractionChange: (next) => {
        lineInteraction = next
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingRectangleHit: () => ({
        instanceId: 'rect-1',
        kind: 'interior',
        priority: 1,
        instanceIndex: 0,
      }),
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 200,
    })

    for (const listener of listeners.get('pointerdown') ?? []) {
      listener({
        button: 0,
        clientX: 150,
        clientY: 50,
        pointerId: 8,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as PointerEvent)
    }

    assert.equal(rectangleInteraction.phase, 'inactive')
    assert.equal(lineInteraction.phase, 'moving')
    assert.equal(lineInteraction.selectedId, 'line-1')
  })
})
