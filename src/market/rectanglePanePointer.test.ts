import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import { attachRectanglePanePointer } from './rectanglePanePointer.ts'
import {
  applyRectangleSelection,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  armRectangleTool,
} from './rectangleInteraction.ts'

function createPaneHarness() {
  const listeners = new Map<string, EventListener>()
  const paneElement = {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
    },
    hasPointerCapture: () => true,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement

  const chart = {
    panes: () => [{ getHTMLElement: () => paneElement }],
    timeScale: () => ({
      coordinateToTime: () => 120,
      coordinateToLogical: (x: number) => x,
      timeToIndex: () => 1,
      logicalToCoordinate: (logical: number) => logical,
      timeToCoordinate: (time: number) => time,
    }),
  }

  return { listeners, paneElement, chart }
}

describe('rectanglePanePointer', () => {
  it('resolves pane-relative pointer coordinates', () => {
    const pane = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 100,
        height: 100,
        right: 110,
        bottom: 120,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    } as HTMLElement
    const event = { clientX: 30, clientY: 50 } as PointerEvent
    assert.equal(resolvePaneRelativePointerX(event, pane), 20)
  })

  it('cleans up pane listeners on dispose', () => {
    const { listeners, chart } = createPaneHarness()
    const controller = attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({ interaction: INITIAL_RECTANGLE_INTERACTION_STATE, instances: [] }),
      getChart: () => chart as never,
      getSeries: () =>
        ({
          coordinateToPrice: () => 10,
          priceToCoordinate: () => 50,
          data: () => [{ time: 100 }, { time: 120 }],
        }) as never,
      onInteractionChange: () => {},
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingLineHit: () => null,
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 120,
    })

    assert.ok(listeners.has('pointerdown'))
    controller.dispose()
    assert.equal(listeners.size, 0)
  })

  it('cancels create interaction on pointercancel', () => {
    const { listeners, chart } = createPaneHarness()
    let interaction = armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE)
    let seriesDataReads = 0
    const series = {
      coordinateToPrice: () => 10,
      priceToCoordinate: () => 50,
      data: () => {
        seriesDataReads += 1
        return [{ time: 100 }, { time: 120 }]
      },
    }

    attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({ interaction, instances: [] }),
      getChart: () => chart as never,
      getSeries: () => series as never,
      onInteractionChange: (next) => {
        interaction = next
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingLineHit: () => null,
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 120,
    })

    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 7,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)
    assert.equal(interaction.phase, 'creating')

    listeners.get('pointercancel')?.({ pointerId: 7 } as PointerEvent)
    assert.equal(interaction.phase, 'inactive')
    assert.equal(interaction.draft, null)
    assert.equal(seriesDataReads, 0)
  })

  it('ignores rectangle pointer handling while alternate tool is active', () => {
    const { listeners, chart } = createPaneHarness()
    let selectionChanged = false

    attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({
        interaction: { phase: 'inactive', selectedId: 'rect-1', draft: null },
        instances: [{ id: 'rect-1', fromTime: 1, toTime: 2, lowPrice: 1, highPrice: 2 }],
      }),
      getChart: () => chart as never,
      getSeries: () =>
        ({
          priceToCoordinate: () => 50,
          data: () => [{ time: 1 }, { time: 2 }],
        }) as never,
      onInteractionChange: () => {
        selectionChanged = true
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => true,
      getCompetingLineHit: () => null,
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 120,
    })

    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)

    assert.equal(selectionChanged, false)
  })

  it('focuses the pane when a chart pointerdown suppresses the default focus move', () => {
    const { listeners, paneElement, chart } = createPaneHarness()
    let focused = 0
    let tabIndex = -1
    Object.assign(paneElement, {
      focus: () => {
        focused += 1
      },
    })
    Object.defineProperty(paneElement, 'tabIndex', {
      configurable: true,
      get: () => tabIndex,
      set: (value: number) => {
        tabIndex = value
      },
    })

    attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({
        interaction: armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE),
        instances: [],
      }),
      getChart: () => chart as never,
      getSeries: () =>
        ({
          coordinateToPrice: () => 10,
          priceToCoordinate: () => 50,
          data: () => [{ time: 100 }, { time: 120 }],
        }) as never,
      onInteractionChange: () => {},
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingLineHit: () => null,
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 120,
    })

    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 3,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)

    assert.equal(focused, 1)
    assert.equal(tabIndex, -1)
  })

  it('yields an interior hit when a line stroke is the competing target', () => {
    const { listeners, chart } = createPaneHarness()
    let interaction = {
      ...INITIAL_RECTANGLE_INTERACTION_STATE,
      selectedId: 'rect-1',
    }

    attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({
        interaction,
        instances: [
          {
            id: 'rect-1',
            fromTime: 100,
            toTime: 200,
            lowPrice: 20,
            highPrice: 80,
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
        interaction = next
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingLineHit: () => ({
        instanceId: 'line-1',
        kind: 'body',
        priority: 1,
        instanceIndex: 0,
      }),
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 200,
    })

    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 150,
      clientY: 50,
      pointerId: 4,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)

    assert.equal(interaction.phase, 'inactive')
    assert.equal(interaction.selectedId, 'rect-1')
  })

  it('selects locked rectangles without starting move or resize drafts', () => {
    const { listeners, chart } = createPaneHarness()
    let interaction = applyRectangleSelection(INITIAL_RECTANGLE_INTERACTION_STATE, null)
    let updated = false

    attachRectanglePanePointer(chart as never, {
      getSnapshot: () => ({
        interaction,
        instances: [
          {
            id: 'rect-locked',
            fromTime: 100,
            toTime: 200,
            lowPrice: 20,
            highPrice: 80,
            locked: true,
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
        interaction = next
        updated = true
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      getPointerPreview: () => ({ time: null, price: null }),
      isAlternateToolActive: () => false,
      getCompetingLineHit: () => null,
      getIntervalDurationSeconds: () => 300,
      getLastBarUnixTime: () => 200,
    })

    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 150,
      clientY: 50,
      pointerId: 5,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as PointerEvent)

    assert.equal(updated, true)
    assert.equal(interaction.phase, 'inactive')
    assert.equal(interaction.selectedId, 'rect-locked')
    assert.equal(interaction.draft, null)
  })

  it('does not swallow pointer events on hidden handles of a selected locked rectangle', () => {
    const { listeners, chart } = createPaneHarness()
    let interaction = applyRectangleSelection(INITIAL_RECTANGLE_INTERACTION_STATE, 'rect-locked')
    const lockedInstance = {
      id: 'rect-locked',
      fromTime: 100,
      toTime: 200,
      lowPrice: 20,
      highPrice: 80,
      locked: true,
    }
    const series = {
      coordinateToPrice: (y: number) => 100 - y,
      priceToCoordinate: (price: number) => 100 - price,
      data: () => [{ time: 100 }, { time: 200 }],
    }

    const attach = (locked: boolean) => {
      attachRectanglePanePointer(chart as never, {
        getSnapshot: () => ({
          interaction,
          instances: [locked ? lockedInstance : { ...lockedInstance, locked: undefined }],
        }),
        getChart: () => chart as never,
        getSeries: () => series as never,
        onInteractionChange: (next) => {
          interaction = next
        },
        onInstanceCompleted: () => {},
        onInstanceUpdated: () => {},
        onRequestRender: () => {},
        onPointerPreviewChange: () => {},
        getPointerPreview: () => ({ time: null, price: null }),
        isAlternateToolActive: () => false,
        getCompetingLineHit: () => ({
          instanceId: 'line-1',
          kind: 'body',
          priority: 1,
          instanceIndex: 0,
        }),
        getIntervalDurationSeconds: () => 300,
        getLastBarUnixTime: () => 200,
      })
    }

    attach(false)
    let unlockedStopped = false
    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 96,
      clientY: 16,
      pointerId: 6,
      preventDefault: () => {},
      stopPropagation: () => {
        unlockedStopped = true
      },
    } as PointerEvent)
    assert.equal(unlockedStopped, true)

    interaction = applyRectangleSelection(INITIAL_RECTANGLE_INTERACTION_STATE, 'rect-locked')
    attach(true)
    let lockedStopped = false
    let lockedPrevented = false
    listeners.get('pointerdown')?.({
      button: 0,
      clientX: 96,
      clientY: 16,
      pointerId: 7,
      preventDefault: () => {
        lockedPrevented = true
      },
      stopPropagation: () => {
        lockedStopped = true
      },
    } as PointerEvent)

    assert.equal(lockedStopped, false)
    assert.equal(lockedPrevented, false)
    assert.equal(interaction.phase, 'inactive')
    assert.equal(interaction.draft, null)
  })
})
