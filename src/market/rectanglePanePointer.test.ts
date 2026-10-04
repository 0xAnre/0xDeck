import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolvePaneRelativePointerX } from './fixedRangeVolumeProfilePanePointer.ts'
import { attachRectanglePanePointer } from './rectanglePanePointer.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE } from './rectangleInteraction.ts'

describe('rectanglePanePointer', () => {
  it('resolves pane-relative pointer coordinates', () => {
    const pane = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120, x: 10, y: 20, toJSON: () => ({}) }),
    } as HTMLElement
    const event = { clientX: 30, clientY: 50 } as PointerEvent
    assert.equal(resolvePaneRelativePointerX(event, pane), 20)
  })

  it('cleans up pane listeners on dispose', () => {
    const listeners = new Map<string, Set<EventListener>>()
    const paneElement = {
      addEventListener: (type: string, listener: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(listener)
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener)
      },
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
      setPointerCapture: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
    } as unknown as HTMLElement

    const chart = {
      panes: () => [{ getHTMLElement: () => paneElement }],
      timeScale: () => ({
        coordinateToTime: () => 100,
      }),
    }

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
    })

    assert.ok(listeners.get('pointerdown')?.size === 1)
    controller.dispose()
    assert.equal(listeners.get('pointerdown')?.size, 0)
  })
})
