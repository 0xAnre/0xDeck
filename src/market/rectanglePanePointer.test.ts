import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import { attachRectanglePanePointer } from './rectanglePanePointer.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE, armRectangleTool } from './rectangleInteraction.ts'

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
        }) as never,
      onInteractionChange: () => {},
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      isAlternateToolActive: () => false,
    })

    assert.ok(listeners.has('pointerdown'))
    controller.dispose()
    assert.equal(listeners.size, 0)
  })

  it('cancels create interaction on pointercancel', () => {
    const { listeners, chart } = createPaneHarness()
    let interaction = armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE)
    const series = {
      coordinateToPrice: () => 10,
      priceToCoordinate: () => 50,
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
      isAlternateToolActive: () => false,
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
        }) as never,
      onInteractionChange: () => {
        selectionChanged = true
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      onPointerPreviewChange: () => {},
      isAlternateToolActive: () => true,
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
})
