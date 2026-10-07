import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyRectangleChartInteractionMode,
  attachRectangleChartTool,
} from './rectangleChartTool.ts'
import { INITIAL_RECTANGLE_INTERACTION_STATE, startRectangleCreateDraft, armRectangleTool } from './rectangleInteraction.ts'
import { INITIAL_FIXED_RANGE_VP_INTERACTION_STATE } from './fixedRangeVolumeProfileInteraction.ts'
import { createRectangleInstance } from './rectangleInstances.ts'
describe('rectangleChartTool', () => {
  it('locks chart navigation only while creating or resizing', () => {
    const options: Array<{ handleScroll: { pressedMouseMove: boolean } }> = []
    const chart = {
      applyOptions: (value: { handleScroll: { pressedMouseMove: boolean } }) => {
        options.push(value)
      },
    }
    applyRectangleChartInteractionMode(
      chart as never,
      INITIAL_RECTANGLE_INTERACTION_STATE,
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    applyRectangleChartInteractionMode(
      chart as never,
      startRectangleCreateDraft(armRectangleTool(INITIAL_RECTANGLE_INTERACTION_STATE), 1, 1),
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    assert.equal(options[0]?.handleScroll.pressedMouseMove, true)
    assert.equal(options[1]?.handleScroll.pressedMouseMove, false)
  })

  it('disposes key listener and pane pointer', () => {
    let keyListenerCount = 0
    const originalWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: (type: string) => {
          if (type === 'keydown') keyListenerCount += 1
        },
        removeEventListener: (type: string) => {
          if (type === 'keydown') keyListenerCount -= 1
        },
      },
    })

    const chart = {
      applyOptions: () => {},
      panes: () => [{ getHTMLElement: () => null }],
    }

    const controller = attachRectangleChartTool(chart as never, {
      getSnapshot: () => ({ interaction: INITIAL_RECTANGLE_INTERACTION_STATE, instances: [] }),
      getPointerPreview: () => ({ pointerTime: null, pointerPrice: null }),
      setPointerPreview: () => {},
      onInteractionChange: () => {},
      onInstancesChange: () => {},
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      getChart: () => chart as never,
      getSeries: () => null,
      getIntervalDurationSeconds: () => 300,
      getFixedRangeVolumeProfileInteraction: () => INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      shouldHandleKeyboardShortcut: () => true,
    })

    assert.equal(keyListenerCount, 1)
    controller.dispose()
    assert.equal(keyListenerCount, 0)
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  })

  it('ignores delete when focus is on a control outside the chart', () => {
    class FakeElement {
      parent: FakeElement | null
      ownerDocument: { body: FakeElement; documentElement: FakeElement }

      constructor(parent: FakeElement | null = null) {
        this.parent = parent
        this.ownerDocument = { body: this, documentElement: this }
      }

      contains(node: FakeElement): boolean {
        let current: FakeElement | null = node
        while (current) {
          if (current === this) return true
          current = current.parent
        }
        return false
      }
    }

    const originalHtmlElement = globalThis.HTMLElement
    const originalWindow = globalThis.window
    let onKeyDown: ((event: { key: string; target: FakeElement; preventDefault: () => void }) => void) | null =
      null
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: (type: string, listener: typeof onKeyDown) => {
          if (type === 'keydown') onKeyDown = listener
        },
        removeEventListener: () => {},
      },
    })

    const body = new FakeElement()
    const headerButton = new FakeElement()
    headerButton.ownerDocument = body.ownerDocument
    const chart = {
      applyOptions: () => {},
      panes: () => [{ getHTMLElement: () => null }],
    }
    const instance = createRectangleInstance({
      fromTime: 1_700_000_000,
      toTime: 1_700_000_300,
      lowPrice: 1,
      highPrice: 2,
    })!
    let instanceCount = 1
    const controller = attachRectangleChartTool(chart as never, {
      getSnapshot: () => ({
        interaction: { phase: 'inactive', selectedId: instance.id, draft: null },
        instances: [instance],
      }),
      getPointerPreview: () => ({ pointerTime: null, pointerPrice: null }),
      setPointerPreview: () => {},
      onInteractionChange: () => {},
      onInstancesChange: (next) => {
        instanceCount = next.length
      },
      onInstanceCompleted: () => {},
      onInstanceUpdated: () => {},
      onRequestRender: () => {},
      getChart: () => chart as never,
      getSeries: () => null,
      getIntervalDurationSeconds: () => 300,
      getFixedRangeVolumeProfileInteraction: () => INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
      shouldHandleKeyboardShortcut: () => true,
    })

    onKeyDown?.({ key: 'Delete', target: headerButton, preventDefault: () => {} })
    assert.equal(instanceCount, 1)
    onKeyDown?.({ key: 'Delete', target: body, preventDefault: () => {} })
    assert.equal(instanceCount, 0)

    controller.dispose()
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: originalHtmlElement })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  })
})
